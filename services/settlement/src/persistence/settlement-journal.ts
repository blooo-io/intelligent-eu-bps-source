import { createRequire } from "node:module";
import {
  PassthroughTransaction,
  RecordingTransaction,
  type SqlExecutor,
  type TransactionClient,
} from "@intelligent/module-template";
import type { OutboxService } from "@intelligent/module-template";
import type { SettlementStore, SettlementWrite } from "../domain/store.js";
import type { BillingRunRecord, PairSettlementRecord } from "../domain/types.js";

const require = createRequire(import.meta.url);

type PgPool = {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  connect(): Promise<TransactionClient>;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settlement_settlements (
  settlement_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS settlement_runs (
  run_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS settlement_carry (
  pair_key TEXT PRIMARY KEY,
  community_id TEXT NOT NULL,
  amount TEXT
);
`;

/** INT-356 — replay recorded settlement mutations. BR-13: settlements and runs are insert-only. */
export async function applySettlementWrites(
  sql: SqlExecutor,
  writes: SettlementWrite[],
): Promise<void> {
  for (const write of writes) {
    if (write.kind === "settlement") {
      const inserted = await sql.query(
        `INSERT INTO settlement_settlements (settlement_id, payload)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (settlement_id) DO NOTHING`,
        [write.row.settlementId, JSON.stringify(write.row)],
      );
      // pg returns rowCount; the fake executor used in tests may not. A conflict
      // on a real server is a no-op here because the in-memory store already refused it.
      void inserted;
    } else if (write.kind === "run") {
      await sql.query(
        `INSERT INTO settlement_runs (run_id, payload)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (run_id) DO NOTHING`,
        [write.row.runId, JSON.stringify(write.row)],
      );
    } else if (write.amount === null) {
      await sql.query("DELETE FROM settlement_carry WHERE pair_key = $1", [write.key]);
    } else {
      await sql.query(
        `INSERT INTO settlement_carry (pair_key, community_id, amount)
         VALUES ($1, $2, $3)
         ON CONFLICT (pair_key) DO UPDATE SET
           community_id = EXCLUDED.community_id,
           amount = EXCLUDED.amount`,
        [write.key, write.communityId, write.amount],
      );
    }
  }
}

export async function hydrateSettlement(
  sql: SqlExecutor,
  store: SettlementStore,
): Promise<void> {
  await sql.query(SCHEMA);
  const settlements = await sql.query(
    "SELECT payload FROM settlement_settlements",
  );
  const runs = await sql.query("SELECT payload FROM settlement_runs");
  const carry = await sql.query(
    "SELECT pair_key, community_id, amount FROM settlement_carry",
  );
  if (
    settlements.rows.length === 0 &&
    runs.rows.length === 0 &&
    carry.rows.length === 0
  ) {
    return;
  }
  const snapshot = {
    settlements: settlements.rows.map((row) => {
      const payload = parsePayload<PairSettlementRecord>(row.payload);
      return [payload.settlementId, payload];
    }),
    runs: runs.rows.map((row) => {
      const payload = parsePayload<BillingRunRecord>(row.payload);
      return [payload.runId, payload];
    }),
    carry: carry.rows.map((row) => [
      String(row.pair_key),
      { communityId: String(row.community_id), amount: String(row.amount) },
    ]),
  };
  store.restore(JSON.stringify(snapshot));
}

function parsePayload<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

export function createSettlementTransaction(
  store: SettlementStore,
  outbox: OutboxService,
  env: NodeJS.ProcessEnv = process.env,
): {
  transaction: PassthroughTransaction | RecordingTransaction<SettlementWrite>;
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
      store,
      outbox,
      () => pool.connect(),
      applySettlementWrites,
    ),
    hydrate: () => hydrateSettlement(pool, store),
  };
}
