/**
 * Payment journal helpers — in-memory paths without DATABASE_URL (INT-356).
 */

import { describe, expect, it, vi } from "vitest";
import { PayoutsStore, type PayoutRecord } from "../domain/payouts.store.js";
import { PaymentsStore, type PaymentRecord } from "../domain/store.js";
import {
  applyJournalWrites,
  applyPaymentWrites,
  createPaymentTransaction,
  hydratePayments,
  journalStore,
} from "./payment-journal.js";
import { hydratePayouts } from "./payout-journal.js";

function samplePayout(id: string): PayoutRecord {
  return {
    payoutId: id,
    participantId: "P",
    communityId: "comm-1",
    period: "2026-10",
    amount: "19.70",
    currency: "EUR",
    status: "in_transit",
    trigger: "participant",
    attempt: 1,
    pspPayoutRef: `po_${id}`,
    invoiceIds: ["iA"],
    requestedAt: `2026-11-24T09:00:0${id.slice(-1)}.000Z`,
  };
}

function samplePayment(id: string, status: PaymentRecord["status"] = "pending"): PaymentRecord {
  return {
    paymentId: id,
    invoiceId: `inv-${id}`,
    participantId: "c1",
    amount: "10.00",
    currency: "EUR",
    status,
    pspPaymentRef: `pi_${id}`,
    communityId: "comm-1",
  };
}

describe("payment-journal (INT-424)", () => {
  it("createPaymentTransaction without DATABASE_URL uses PassthroughTransaction", async () => {
    const store = new PaymentsStore();
    const outbox = { append: vi.fn() } as never;
    const { transaction, hydrate } = createPaymentTransaction(store, new PayoutsStore(), outbox, {});
    expect(transaction.constructor.name).toBe("PassthroughTransaction");
    await expect(hydrate()).resolves.toBeUndefined();
  });

  it("createPaymentTransaction with DATABASE_URL records payments and payouts together", () => {
    const outbox = { append: vi.fn() } as never;
    const { transaction } = createPaymentTransaction(new PaymentsStore(), new PayoutsStore(), outbox, {
      DATABASE_URL: "postgres://u:p@127.0.0.1:1/none",
    });
    expect(transaction.constructor.name).toBe("RecordingTransaction");
  });

  it("REQ-015: applyJournalWrites routes payment and payout rows to their tables", async () => {
    const queries: { text: string; params: unknown[] }[] = [];
    const sql = {
      query: async (text: string, params?: unknown[]) => {
        queries.push({ text, params: params ?? [] });
        return { rows: [] };
      },
    };
    await applyJournalWrites(sql, [
      { row: samplePayment("pay-1") },
      { kind: "payout", row: samplePayout("po-1") },
    ]);
    expect(queries.map((q) => [q.text.match(/INSERT INTO (\w+)/)?.[1], q.params[0]])).toEqual([
      ["payments", "pay-1"],
      ["payouts", "po-1"],
    ]);
    expect(queries[1]?.params.slice(1, 3)).toEqual(["P", "2026-10"]);
    queries.length = 0;
    await applyJournalWrites(sql, []);
    expect(queries).toEqual([]);
  });

  it("REQ-015: journalStore records, snapshots and restores both stores as one unit", () => {
    const payments = new PaymentsStore();
    const payouts = new PayoutsStore();
    const journal = journalStore(payments, payouts);
    const before = journal.snapshot();
    journal.beginRecording();
    payments.putPayment(samplePayment("pay-1"));
    payouts.put(samplePayout("po-1"));
    expect(journal.takeRecording()).toHaveLength(2);
    journal.restore(before);
    expect(payments.getPayment("pay-1")).toBeUndefined();
    expect(payouts.get("po-1")).toBeUndefined();
    journal.beginRecording();
    payouts.put(samplePayout("po-2"));
    journal.stopRecording();
    expect(journal.takeRecording()).toEqual([]);
  });

  it("hydratePayouts creates the table and restores rows (object or JSON string payloads)", async () => {
    const store = new PayoutsStore();
    const texts: string[] = [];
    const sql = {
      query: async (text: string) => {
        texts.push(text);
        if (text.startsWith("SELECT")) {
          return { rows: [{ payload: samplePayout("po-1") }, { payload: JSON.stringify(samplePayout("po-2")) }] };
        }
        return { rows: [] };
      },
    };
    await hydratePayouts(sql, store);
    expect(texts[0]).toMatch(/CREATE TABLE IF NOT EXISTS payouts/);
    expect(store.listForParticipant("P").map((p) => p.payoutId)).toEqual(["po-1", "po-2"]);
  });

  it("applyPaymentWrites upserts each payment row", async () => {
    const queries: { text: string; params: unknown[] }[] = [];
    const sql = {
      query: async (text: string, params?: unknown[]) => {
        queries.push({ text, params: params ?? [] });
        return { rows: [] };
      },
    };
    await applyPaymentWrites(sql, [{ row: samplePayment("pay-1") }]);
    expect(queries).toHaveLength(1);
    expect(queries[0]?.params[0]).toBe("pay-1");
  });

  it("hydratePayments no-ops on an empty table then restores rows", async () => {
    const store = new PaymentsStore();
    const emptySql = {
      query: async () => ({ rows: [] }),
    };
    await hydratePayments(emptySql, store);
    expect(JSON.parse(store.snapshot()).payments).toEqual([]);

    const row = samplePayment("pay-2", "succeeded");
    let calls = 0;
    const loadedSql = {
      query: async () => {
        calls += 1;
        if (calls === 1) return { rows: [] }; // SCHEMA create
        return { rows: [{ payload: row }] };
      },
    };
    await hydratePayments(loadedSql, store);
    expect(store.getPayment("pay-2")?.status).toBe("succeeded");
  });

  it("hydratePayments accepts JSON-string payloads from the driver", async () => {
    const store = new PaymentsStore();
    const row = samplePayment("pay-3", "failed");
    let calls = 0;
    const sql = {
      query: async () => {
        calls += 1;
        if (calls === 1) return { rows: [] };
        return { rows: [{ payload: JSON.stringify(row) }] };
      },
    };
    await hydratePayments(sql, store);
    expect(store.getPayment("pay-3")?.status).toBe("failed");
  });
});
