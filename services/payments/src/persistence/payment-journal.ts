import { createRequire } from "node:module";
import {
  PassthroughTransaction,
  RecordingTransaction,
  type OutboxService,
  type RecordableStore,
  type SqlExecutor,
  type TransactionClient,
} from "@intelligent/module-template";
import type { PayoutsStore, PayoutWrite } from "../domain/payouts.store.js";
import type { PaymentRecord } from "../domain/store.js";
import type { PaymentsStore, PaymentWrite } from "../domain/store.js";
import { applyPayoutWrites, hydratePayouts } from "./payout-journal.js";

const require = createRequire(import.meta.url);

type PgPool = {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  connect(): Promise<TransactionClient>;
};

export type JournalWrite = PaymentWrite | PayoutWrite;

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

function isPayoutWrite(write: JournalWrite): write is PayoutWrite {
  return "kind" in write && write.kind === "payout";
}

export async function applyJournalWrites(sql: SqlExecutor, writes: JournalWrite[]): Promise<void> {
  const payouts = writes.filter(isPayoutWrite);
  const payments = writes.filter((write): write is PaymentWrite => !isPayoutWrite(write));
  if (payments.length > 0) await applyPaymentWrites(sql, payments);
  if (payouts.length > 0) await applyPayoutWrites(sql, payouts);
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

/** REQ-015 — payments and payouts recorded and rolled back as one unit with the outbox. */
export function journalStore(
  payments: PaymentsStore,
  payouts: PayoutsStore,
): RecordableStore<JournalWrite> {
  return {
    beginRecording: () => {
      payments.beginRecording();
      payouts.beginRecording();
    },
    takeRecording: () => [...payments.takeRecording(), ...payouts.takeRecording()],
    stopRecording: () => {
      payments.stopRecording();
      payouts.stopRecording();
    },
    snapshot: () => JSON.stringify({ payments: payments.snapshot(), payouts: payouts.snapshot() }),
    restore: (snapshot) => {
      const parsed = JSON.parse(snapshot) as { payments: string; payouts: string };
      payments.restore(parsed.payments);
      payouts.restore(parsed.payouts);
    },
  };
}

export function createPaymentTransaction(
  store: PaymentsStore,
  payouts: PayoutsStore,
  outbox: OutboxService,
  env: NodeJS.ProcessEnv = process.env,
): {
  transaction: PassthroughTransaction | RecordingTransaction<JournalWrite>;
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
      journalStore(store, payouts),
      outbox,
      () => pool.connect(),
      applyJournalWrites,
    ),
    hydrate: async () => {
      await hydratePayments(pool, store);
      await hydratePayouts(pool, payouts);
    },
  };
}
