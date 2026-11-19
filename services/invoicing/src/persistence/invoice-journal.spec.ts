import { describe, expect, it, vi } from "vitest";
import { InMemoryOutboxStore, OutboxService } from "@intelligent/module-template";
import { InvoiceStore } from "../domain/store.js";
import { UAT_INVOICE_ID } from "../domain/uat-seed.js";
import {
  applyInvoiceWrites,
  createInvoiceTransaction,
  hydrateInvoices,
} from "./invoice-journal.js";

describe("invoice journal (INT-356)", () => {
  it("applyInvoiceWrites upserts invoice cache rows", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const store = new InvoiceStore();
    const row = store.get(UAT_INVOICE_ID)!;

    await applyInvoiceWrites({ query }, [{ row }]);

    expect(query).toHaveBeenCalledOnce();
    expect(String(query.mock.calls[0]?.[0])).toContain("INSERT INTO invoices");
    expect(query.mock.calls[0]?.[1]).toEqual([
      row.invoiceId,
      row.settlementId,
      JSON.stringify(row),
    ]);
  });

  it("hydrateInvoices seeds an empty database from the in-memory store", async () => {
    const store = new InvoiceStore();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("CREATE TABLE")) return { rows: [] };
      return { rows: [] };
    });
    await hydrateInvoices({ query }, store);
    const applyCalls = query.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO"),
    );
    expect(applyCalls.length).toBeGreaterThan(0);
  });

  it("hydrateInvoices restores rows when the database is populated", async () => {
    const store = new InvoiceStore();
    const row = store.get(UAT_INVOICE_ID)!;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("CREATE TABLE")) return { rows: [] };
      if (sql.includes("FROM invoices")) {
        return { rows: [{ payload: JSON.stringify(row) }] };
      }
      return { rows: [] };
    });

    store.put({ ...row, status: "Void" });
    await hydrateInvoices({ query }, store);
    expect(store.get(row.invoiceId)?.status).toBe(row.status);
  });

  it("hydrateInvoices parses object payloads from jsonb", async () => {
    const store = new InvoiceStore();
    const row = store.get(UAT_INVOICE_ID)!;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("CREATE TABLE")) return { rows: [] };
      if (sql.includes("FROM invoices")) {
        return { rows: [{ payload: row }] };
      }
      return { rows: [] };
    });

    await hydrateInvoices({ query }, store);
    expect(store.get(row.invoiceId)?.invoiceId).toBe(row.invoiceId);
  });

  it("createInvoiceTransaction uses passthrough when DATABASE_URL is unset", async () => {
    const store = new InvoiceStore();
    const outbox = new OutboxService(new InMemoryOutboxStore());
    const { transaction, hydrate } = createInvoiceTransaction(store, outbox, {});
    expect(transaction).toBeDefined();
    await expect(hydrate()).resolves.toBeUndefined();
  });
});