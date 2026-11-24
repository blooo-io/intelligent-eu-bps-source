import { createRequire } from "node:module";
import {
  PassthroughTransaction,
  RecordingTransaction,
  type OutboxService,
  type SqlExecutor,
  type TransactionClient,
} from "@intelligent/module-template";
import type { CommunitySettings, ParticipantRecord } from "../domain/types.js";
import type { ManagerConsent } from "../domain/manager-consent.js";
import type { ParticipantsStore, ParticipantWrite } from "../domain/store.js";

const require = createRequire(import.meta.url);

type PgPool = {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  connect(): Promise<TransactionClient>;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS participants (
  participant_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS communities (
  community_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS manager_consents (
  consent_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL
);
`;

/** INT-356 / REQ-005 — registry rows committed with the outbox. */
export async function applyParticipantWrites(
  sql: SqlExecutor,
  writes: ParticipantWrite[],
): Promise<void> {
  for (const write of writes) {
    if (write.kind === "participant") {
      await sql.query(
        `INSERT INTO participants (participant_id, payload)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (participant_id) DO UPDATE SET payload = EXCLUDED.payload`,
        [write.row.participantId, JSON.stringify(write.row)],
      );
    } else if (write.kind === "community") {
      await sql.query(
        `INSERT INTO communities (community_id, payload)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (community_id) DO UPDATE SET payload = EXCLUDED.payload`,
        [write.row.communityId, JSON.stringify(write.row)],
      );
    } else {
      // REQ-050 — manager T&C consent (journal JSONB).
      const key = `${write.row.communityId}:${write.row.subjectId}`;
      await sql.query(
        `INSERT INTO manager_consents (consent_key, payload)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (consent_key) DO UPDATE SET payload = EXCLUDED.payload`,
        [key, JSON.stringify(write.row)],
      );
    }
  }
}

export async function hydrateParticipants(
  sql: SqlExecutor,
  store: ParticipantsStore,
): Promise<void> {
  await sql.query(SCHEMA);
  const participants = await sql.query("SELECT payload FROM participants");
  const communities = await sql.query("SELECT payload FROM communities");
  const consents = await sql.query("SELECT payload FROM manager_consents");
  if (participants.rows.length === 0 && communities.rows.length === 0) {
    const seeded = JSON.parse(store.snapshot()) as {
      participants: ParticipantRecord[];
      communities: CommunitySettings[];
      managerConsents?: ManagerConsent[];
    };
    await applyParticipantWrites(sql, [
      ...seeded.communities.map((row) => ({ kind: "community" as const, row })),
      ...seeded.participants.map((row) => ({ kind: "participant" as const, row })),
      ...(seeded.managerConsents ?? []).map((row) => ({
        kind: "manager_consent" as const,
        row,
      })),
    ]);
    return;
  }
  const parse = (value: unknown) =>
    typeof value === "string" ? JSON.parse(value) : value;
  const current = JSON.parse(store.snapshot()) as { terms: unknown };
  store.restore(
    JSON.stringify({
      terms: current.terms,
      // REQ-015 — rows persisted before autoPayout existed read as manual payouts.
      communities: communities.rows.map((row) => ({
        autoPayout: false,
        ...(parse(row.payload) as Partial<CommunitySettings>),
      })),
      participants: participants.rows.map((row) => parse(row.payload)),
      managerConsents: consents.rows.map((row) => parse(row.payload)),
    }),
  );
}

export function createParticipantTransaction(
  store: ParticipantsStore,
  outbox: OutboxService,
  env: NodeJS.ProcessEnv = process.env,
): {
  transaction: PassthroughTransaction | RecordingTransaction<ParticipantWrite>;
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
      applyParticipantWrites,
    ),
    hydrate: () => hydrateParticipants(pool, store),
  };
}
