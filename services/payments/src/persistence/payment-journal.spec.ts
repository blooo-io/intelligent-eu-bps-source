/**
 * Payment journal helpers — in-memory paths without DATABASE_URL (INT-356).
 */

import { describe, expect, it, vi } from "vitest";
import { PaymentsStore, type PaymentRecord } from "../domain/store.js";
import {
  applyPaymentWrites,
  createPaymentTransaction,
  hydratePayments,
} from "./payment-journal.js";

function samplePayment(id: string, status: PaymentRecord["status"] = "pending"): PaymentRecord {
  return {
    paymentId: id,
    invoiceId: `inv-${id}`,
    participantId: "c1",
    amount: "10.00",
    currency: "EUR",
    status,
    stripePaymentId: `pi_${id}`,
    communityId: "comm-1",
  };
}

describe("payment-journal (INT-424)", () => {
  it("createPaymentTransaction without DATABASE_URL uses PassthroughTransaction", async () => {
    const store = new PaymentsStore();
    const outbox = { append: vi.fn() } as never;
    const { transaction, hydrate } = createPaymentTransaction(store, outbox, {});
    expect(transaction.constructor.name).toBe("PassthroughTransaction");
    await expect(hydrate()).resolves.toBeUndefined();
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
