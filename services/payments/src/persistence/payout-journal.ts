import type { SqlExecutor } from "@intelligent/module-template";
import type { PayoutRecord, PayoutsStore, PayoutWrite } from "../domain/payouts.store.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS payouts (
  payout_id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  period TEXT NOT NULL,
  payload JSONB NOT NULL
);
`;

/** REQ-015 — payout records, committed in the same transaction as the outbox. */
export async function applyPayoutWrites(sql: SqlExecutor, writes: PayoutWrite[]): Promise<void> {
  for (const write of writes) {
    await sql.query(
      `INSERT INTO payouts (payout_id, participant_id, period, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (payout_id) DO UPDATE SET
         participant_id = EXCLUDED.participant_id,
         period = EXCLUDED.period,
         payload = EXCLUDED.payload`,
      [write.row.payoutId, write.row.participantId, write.row.period, JSON.stringify(write.row)],
    );
  }
}

export async function hydratePayouts(sql: SqlExecutor, store: PayoutsStore): Promise<void> {
  await sql.query(SCHEMA);
  const loaded = await sql.query("SELECT payload FROM payouts");
  const rows = loaded.rows.map((row) =>
    (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as PayoutRecord,
  );
  store.restore(JSON.stringify(rows));
}
