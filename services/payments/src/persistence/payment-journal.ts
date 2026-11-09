import { createRequire } from "node:module";
import {
  PassthroughTransaction,
  RecordingTransaction,
  type OutboxService,
  type SqlExecutor,
  type TransactionClient,
} from "@intelligent/module-template";
import type { PaymentRecord } from "../domain/store.js";
import type { PaymentsStore, PaymentWrite } from "../domain/store.js";

const require = createRequire(import.meta.url);

type PgPool = {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  connect(): Promise<TransactionClient>;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS payments (
  payment_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL
);
`;

/** INT-356 — payment attempts, committed in the same transaction as the outbox. */
export async function applyPaymentWrites(
  sql: SqlExecutor,
  writes: PaymentWrite[],
): Promise<void> {
  for (const write of writes) {
    await sql.query(
      `INSERT INTO payments (payment_id, payload)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (payment_id) DO UPDATE SET payload = EXCLUDED.payload`,
      [write.row.paymentId, JSON.stringify(write.row)],
    );
  }
}

export async function hydratePayments(sql: SqlExecutor, store: PaymentsStore): Promise<void> {
  await sql.query(SCHEMA);
  const loaded = await sql.query("SELECT payload FROM payments");
  if (loaded.rows.length === 0) return;
  const existing = store.snapshot();
  const accounts = (JSON.parse(existing) as { accounts: unknown[] }).accounts;
  const payments = loaded.rows.map((row) =>
    (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as PaymentRecord,
  );
  store.restore(JSON.stringify({ payments, accounts }));
}

export function createPaymentTransaction(
  store: PaymentsStore,
  outbox: OutboxService,
  env: NodeJS.ProcessEnv = process.env,
): {
  transaction: PassthroughTransaction | RecordingTransaction<PaymentWrite>;
  hydrate: () => Promise<void>;
} {
  const url = env.DATABASE_URL;
  if (!url) {
    return { transaction: new PassthroughTransaction(), hydrate: async () => undefined };
  }
  const pg = require("pg") as { Pool: new (cfg: { connectionString: string }) => PgPool };
  const pool = new pg.Pool({ connectionString: url });
  return {
    transaction: new RecordingTransaction(store, outbox, () => pool.connect(), applyPaymentWrites),
    hydrate: () => hydratePayments(pool, store),
  };
}
