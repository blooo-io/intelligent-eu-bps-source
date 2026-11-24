import { describe, expect, it, vi } from "vitest";
import {
  InMemoryOutboxStore,
  OutboxService,
  RecordingTransaction,
} from "@intelligent/module-template";
import { StatementStore, type StatementRecord } from "../domain/statement-store.js";
import { InvoiceStore } from "../domain/store.js";
import { UAT_INVOICE_ID } from "../domain/uat-seed.js";
import {
  applyInvoiceWrites,
  createInvoiceTransaction,
  hydrateInvoices,
  journalStore,
} from "./invoice-journal.js";

describe("invoice journal (INT-356)", () => {
  it("applyInvoiceWrites upserts invoice cache rows", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const store = new InvoiceStore();
    const row = store.get(UAT_INVOICE_ID)!;

    await applyInvoiceWrites({ query }, [{ kind: "invoice", row }]);

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
    const { transaction, hydrate } = createInvoiceTransaction(
      store,
      new StatementStore(),
      outbox,
      {},
    );
    expect(transaction).toBeDefined();
    await expect(hydrate()).resolves.toBeUndefined();
  });

  it("createInvoiceTransaction records into Postgres when DATABASE_URL is set", () => {
    const { transaction } = createInvoiceTransaction(
      new InvoiceStore(),
      new StatementStore(),
      new OutboxService(new InMemoryOutboxStore()),
      { DATABASE_URL: "postgres://user@127.0.0.1:1/none" },
    );
    expect(transaction).toBeInstanceOf(RecordingTransaction);
  });

  it("REQ-059: a statement write upserts into statements", async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }));
    await applyInvoiceWrites({ query }, [{ kind: "statement", row: statement }]);
    expect(query).toHaveBeenCalledOnce();
    expect(String(query.mock.calls[0]?.[0])).toContain("INSERT INTO statements");
    expect(String(query.mock.calls[0]?.[0])).toContain("ON CONFLICT (statement_id)");
    expect(query.mock.calls[0]?.[1]).toEqual([
      statement.statementId,
      statement.participantId,
      statement.period,
      JSON.stringify(statement),
    ]);
  });

  it("REQ-059: hydrateInvoices creates and restores statements", async () => {
    const statements = new StatementStore();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM statements")) return { rows: [{ payload: statement }] };
      return { rows: [] };
    });
    await hydrateInvoices({ query }, new InvoiceStore(), statements);
    expect(String(query.mock.calls[0]?.[0])).toContain("CREATE TABLE IF NOT EXISTS statements");
    expect(statements.find("P", "COM", "2026-10")?.statementId).toBe(statement.statementId);
  });

  it("REQ-059: hydrateInvoices parses string statement payloads", async () => {
    const statements = new StatementStore();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM statements")) {
        return { rows: [{ payload: JSON.stringify(statement) }] };
      }
      return { rows: [] };
    });
    await hydrateInvoices({ query }, new InvoiceStore(), statements);
    expect(statements.listByParticipant(["P"])).toHaveLength(1);
  });

  it("journalStore records invoices and statements together and rolls both back", () => {
    const invoices = new InvoiceStore();
    const statements = new StatementStore();
    const journal = journalStore(invoices, statements);
    const snap = journal.snapshot();

    journal.beginRecording();
    invoices.put({ ...invoices.get(UAT_INVOICE_ID)!, status: "Void" });
    statements.upsert(statement);
    expect(journal.takeRecording().map((w) => w.kind)).toEqual(["invoice", "statement"]);

    journal.restore(snap);
    expect(invoices.get(UAT_INVOICE_ID)?.status).toBe("Paid");
    expect(statements.listByParticipant(["P"])).toHaveLength(0);

    journal.beginRecording();
    statements.upsert(statement);
    journal.stopRecording();
    expect(journal.takeRecording()).toHaveLength(0);
  });
});

const statement: StatementRecord = {
  statementId: "5ta7e000-0000-4000-8000-000000000001",
  participantId: "P",
  communityId: "COM",
  period: "2026-10",
  periodFrom: "2026-10-01T00:00:00.000Z",
  periodUntil: "2026-11-01T00:00:00.000Z",
  currency: "EUR",
  totalBought: "0.00",
  totalSold: "1.00",
  netBalance: "1.00",
  direction: "to_receive",
  invoiceIds: ["i1"],
  status: "Open",
  revision: 1,
  issuedAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};