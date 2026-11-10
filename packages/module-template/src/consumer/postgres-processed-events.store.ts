import type { SqlExecutor } from "../outbox/postgres-outbox.store.js";
import type { ProcessedEventsStore } from "./idempotent-consumer.js";

/**
 * INT-339 / 04 §6.3 — durable dedupe on eventId. Unique insert is the claim.
 */
export class PostgresProcessedEventsStore implements ProcessedEventsStore {
  constructor(private readonly sql: SqlExecutor) {}

  async has(eventId: string): Promise<boolean> {
    const result = await this.sql.query(
      `SELECT 1 FROM processed_events WHERE event_id = $1`,
      [eventId],
    );
    return result.rows.length > 0;
  }

  async claim(eventId: string): Promise<boolean> {
    const result = await this.sql.query(
      `INSERT INTO processed_events (event_id) VALUES ($1)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [eventId],
    );
    return result.rows.length > 0;
  }

  async release(eventId: string): Promise<void> {
    await this.sql.query(`DELETE FROM processed_events WHERE event_id = $1`, [
      eventId,
    ]);
  }
}
