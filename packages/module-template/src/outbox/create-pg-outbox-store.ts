import { createRequire } from "node:module";
import {
  InMemoryProcessedEventsStore,
  type ProcessedEventsStore,
} from "../consumer/idempotent-consumer.js";
import { PostgresProcessedEventsStore } from "../consumer/postgres-processed-events.store.js";
import { InMemoryOutboxStore, type OutboxStore } from "./outbox.types.js";
import { resolveOutboxStore, type SqlExecutor } from "./postgres-outbox.store.js";

const require = createRequire(import.meta.url);

type PgPool = {
  query(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
};

type PgModule = {
  Pool: new (cfg: { connectionString: string }) => PgPool;
};

/**
 * INT-213 — SqlExecutor backed by `pg` (MIT). Services that set DATABASE_URL
 * must declare `pg` as a dependency so the require resolves at runtime.
 */
export function createPgPoolExecutor(databaseUrl: string): SqlExecutor {
  const pg = require("pg") as PgModule;
  const pool = new pg.Pool({ connectionString: databaseUrl });
  return {
    query: (text, params) => pool.query(text, params),
  };
}

/**
 * Prefer Postgres outbox when DATABASE_URL is set; otherwise in-memory (CI).
 */
/**
 * INT-339 — Postgres processed_events when DATABASE_URL is set; memory in CI.
 */
export function defaultProcessedEventsStore(
  env: NodeJS.ProcessEnv = process.env,
): ProcessedEventsStore {
  const url = env.DATABASE_URL ?? "";
  if (url) {
    return new PostgresProcessedEventsStore(createPgPoolExecutor(url));
  }
  return new InMemoryProcessedEventsStore();
}

export function defaultOutboxStore(env: NodeJS.ProcessEnv = process.env): OutboxStore {
  return resolveOutboxStore({
    databaseUrl: env.DATABASE_URL,
    createSql: (url) => createPgPoolExecutor(url),
    memory: new InMemoryOutboxStore(),
  });
}
