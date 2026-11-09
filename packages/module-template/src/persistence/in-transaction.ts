import type { SqlExecutor } from "../outbox/postgres-outbox.store.js";

export type TransactionClient = SqlExecutor & {
  release(): void;
};

/**
 * INT-356 — one database transaction for the business rows and the outbox rows.
 * `connect` is `pool.connect()` when DATABASE_URL is set.
 */
export async function inTransaction<T>(
  connect: () => Promise<TransactionClient>,
  fn: (sql: SqlExecutor) => Promise<T>,
): Promise<T> {
  const client = await connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
