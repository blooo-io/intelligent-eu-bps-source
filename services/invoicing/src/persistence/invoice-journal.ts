import { createRequire } from "node:module";
import {
  PassthroughTransaction,
  RecordingTransaction,
  type OutboxService,
  type SqlExecutor,
  type TransactionClient,
} from "@intelligent/module-template";
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
`;

/** INT-356 — upsert the invoice cache row (TP-7, rebuildable, but kept across restarts). */
export async function applyInvoiceWrites(
  sql: SqlExecutor,
  writes: InvoiceWrite[],
): Promise<void> {
  for (const write of writes) {
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

export async function hydrateInvoices(sql: SqlExecutor, store: InvoiceStore): Promise<void> {
  await sql.query(SCHEMA);
  const loaded = await sql.query("SELECT payload FROM invoices");
  if (loaded.rows.length === 0) {
    // First boot keeps the in-memory seed (UAT fixtures) by writing it once.
    const seed = store.list();
    if (seed.length > 0) await applyInvoiceWrites(sql, seed.map((row) => ({ row })));
    return;
  }
  const rows = loaded.rows.map((row) =>
    (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as InvoiceRecord,
  );
  store.restore(JSON.stringify(rows));
}

export function createInvoiceTransaction(
  store: InvoiceStore,
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
    transaction: new RecordingTransaction(store, outbox, () => pool.connect(), applyInvoiceWrites),
    hydrate: () => hydrateInvoices(pool, store),
  };
}
