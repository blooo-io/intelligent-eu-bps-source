import { createRequire } from "node:module";
import {
  PassthroughTransaction,
  RecordingTransaction,
  type OutboxService,
  type RecordableStore,
  type SqlExecutor,
  type TransactionClient,
} from "@intelligent/module-template";
import type { StatementRecord, StatementStore } from "../domain/statement-store.js";
import type { InvoiceRecord } from "../domain/types.js";
import type { InvoiceStore, InvoiceWrite } from "../domain/store.js";

const require = createRequire(import.meta.url);

type PgPool = {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  connect(): Promise<TransactionClient>;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS invoices (
  invoice_id TEXT PRIMARY KEY,
  settlement_id TEXT NOT NULL,
  payload JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS statements (
  statement_id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  period TEXT NOT NULL,
  payload JSONB NOT NULL
);
`;

/** INT-356 — upsert the invoice and statement cache rows (TP-7, rebuildable, but kept across restarts). */
export async function applyInvoiceWrites(
  sql: SqlExecutor,
  writes: InvoiceWrite[],
): Promise<void> {
  for (const write of writes) {
    if (write.kind === "statement") {
      await sql.query(
        `INSERT INTO statements (statement_id, participant_id, period, payload)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (statement_id) DO UPDATE SET
           participant_id = EXCLUDED.participant_id,
           period = EXCLUDED.period,
           payload = EXCLUDED.payload`,
        [write.row.statementId, write.row.participantId, write.row.period, JSON.stringify(write.row)],
      );
      continue;
    }
    await sql.query(
      `INSERT INTO invoices (invoice_id, settlement_id, payload)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (invoice_id) DO UPDATE SET
         settlement_id = EXCLUDED.settlement_id,
         payload = EXCLUDED.payload`,
      [write.row.invoiceId, write.row.settlementId, JSON.stringify(write.row)],
    );
  }
}

function payloads<T>(rows: Record<string, unknown>[]): T[] {
  return rows.map((row) =>
    (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as T,
  );
}

export async function hydrateInvoices(
  sql: SqlExecutor,
  store: InvoiceStore,
  statements?: StatementStore,
): Promise<void> {
  await sql.query(SCHEMA);
  if (statements) {
    const saved = await sql.query("SELECT payload FROM statements");
    statements.restore(JSON.stringify(payloads<StatementRecord>(saved.rows)));
  }
  const loaded = await sql.query("SELECT payload FROM invoices");
  if (loaded.rows.length === 0) {
    // First boot keeps the in-memory seed (UAT fixtures) by writing it once.
    const seed = store.list();
    if (seed.length > 0) {
      await applyInvoiceWrites(sql, seed.map((row) => ({ kind: "invoice", row })));
    }
    return;
  }
  store.restore(JSON.stringify(payloads<InvoiceRecord>(loaded.rows)));
}

/** REQ-059 — invoices and statements recorded and rolled back as one unit with the outbox. */
export function journalStore(
  invoices: InvoiceStore,
  statements: StatementStore,
): RecordableStore<InvoiceWrite> {
  return {
    beginRecording: () => {
      invoices.beginRecording();
      statements.beginRecording();
    },
    takeRecording: () => [...invoices.takeRecording(), ...statements.takeRecording()],
    stopRecording: () => {
      invoices.stopRecording();
      statements.stopRecording();
    },
    snapshot: () =>
      JSON.stringify({ invoices: invoices.snapshot(), statements: statements.snapshot() }),
    restore: (snapshot) => {
      const parsed = JSON.parse(snapshot) as { invoices: string; statements: string };
      invoices.restore(parsed.invoices);
      statements.restore(parsed.statements);
    },
  };
}

export function createInvoiceTransaction(
  store: InvoiceStore,
  statements: StatementStore,
  outbox: OutboxService,
  env: NodeJS.ProcessEnv = process.env,
): {
  transaction: PassthroughTransaction | RecordingTransaction<InvoiceWrite>;
  hydrate: () => Promise<void>;
} {
  const url = env.DATABASE_URL;
  if (!url) {
    return { transaction: new PassthroughTransaction(), hydrate: async () => undefined };
  }
  const pg = require("pg") as { Pool: new (cfg: { connectionString: string }) => PgPool };
  const pool = new pg.Pool({ connectionString: url });
  return {
    transaction: new RecordingTransaction(
      journalStore(store, statements),
      outbox,
      () => pool.connect(),
      applyInvoiceWrites,
    ),
    hydrate: () => hydrateInvoices(pool, store, statements),
  };
}
