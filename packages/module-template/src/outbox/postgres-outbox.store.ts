import type { OutboxRow, OutboxStore } from "./outbox.types.js";

/**
 * Minimal SQL runner so modules can inject `pg.Pool` (or a test double)
 * without coupling the template to a specific driver at compile time (INT-207).
 */
export type SqlQueryResult = { rows: Record<string, unknown>[] };

export type SqlExecutor = {
  query(text: string, params?: unknown[]): Promise<SqlQueryResult>;
};

/**
 * Postgres-backed outbox (TD-6 / TD-7). Rows match `sql/outbox.sql`.
 * Business code still goes through OutboxService; Debezium publishes to NATS.
 */
export class PostgresOutboxStore implements OutboxStore {
  constructor(private readonly sql: SqlExecutor) {}

  async append(row: OutboxRow): Promise<void> {
    await this.sql.query(
      `INSERT INTO outbox (id, aggregate_type, aggregate_id, event, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz)`,
      [
        row.id,
        row.aggregateType,
        row.aggregateId,
        JSON.stringify(row.event),
        row.createdAt,
      ],
    );
  }

  async list(): Promise<readonly OutboxRow[]> {
    const result = await this.sql.query(
      `SELECT id, aggregate_type, aggregate_id, event, created_at
       FROM outbox
       ORDER BY created_at ASC, id ASC`,
    );
    return result.rows.map((r) => mapRow(r));
  }
}

function mapRow(r: Record<string, unknown>): OutboxRow {
  const event =
    typeof r.event === "string"
      ? (JSON.parse(r.event) as OutboxRow["event"])
      : (r.event as OutboxRow["event"]);
  const createdAt =
    r.created_at instanceof Date
      ? r.created_at.toISOString()
      : String(r.created_at);
  return {
    id: String(r.id),
    aggregateType: String(r.aggregate_type),
    aggregateId: String(r.aggregate_id),
    event,
    createdAt,
  };
}

/**
 * Prefer Postgres when DATABASE_URL is set; otherwise keep in-memory (CI / local).
 * Callers still supply an SqlExecutor factory so `pg` stays an optional peer.
 */
export function resolveOutboxStore(opts: {
  databaseUrl?: string;
  createSql?: (databaseUrl: string) => SqlExecutor;
  memory?: OutboxStore;
}): OutboxStore {
  const url = opts.databaseUrl ?? process.env.DATABASE_URL ?? "";
  if (url && opts.createSql) {
    return new PostgresOutboxStore(opts.createSql(url));
  }
  if (!opts.memory) {
    throw new Error(
      "resolveOutboxStore requires memory store when DATABASE_URL is unset",
    );
  }
  return opts.memory;
}
