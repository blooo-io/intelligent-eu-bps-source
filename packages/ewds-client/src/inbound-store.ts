/** REQ-053 — hard maximum EWDS inbound retention (7 days). */
export const MAX_RETENTION_MS = 7 * 24 * 3600 * 1000;

export type InboundRecord = {
  messageId: string;
  topicName: string;
  sender: string;
  receivedAt: string;
  payload: string | null;
  status: "received" | "processed" | "rejected";
};

export interface InboundMessageStore {
  saveIfNew(r: InboundRecord): Promise<boolean>;
  mark(messageId: string, status: "processed" | "rejected"): Promise<void>;
  purge(now: Date, maxAgeMs?: number): Promise<number>;
}

export type SqlQueryResult = { rows: Record<string, unknown>[] };
export type SqlExecutor = {
  query(text: string, params?: unknown[]): Promise<SqlQueryResult>;
};

export class InMemoryInboundStore implements InboundMessageStore {
  readonly rows = new Map<string, InboundRecord>();

  async saveIfNew(r: InboundRecord): Promise<boolean> {
    if (this.rows.has(r.messageId)) return false;
    this.rows.set(r.messageId, { ...r });
    return true;
  }

  async mark(
    messageId: string,
    status: "processed" | "rejected",
  ): Promise<void> {
    const row = this.rows.get(messageId);
    if (!row) return;
    row.status = status;
    row.payload = null;
  }

  async purge(now: Date, maxAgeMs = MAX_RETENTION_MS): Promise<number> {
    assertRetention(maxAgeMs);
    const cutoff = now.getTime() - maxAgeMs;
    let removed = 0;
    for (const [id, row] of this.rows) {
      const at = Date.parse(row.receivedAt);
      if (row.status === "processed" || row.status === "rejected") {
        row.payload = null;
      }
      if (at < cutoff) {
        this.rows.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}

export class PgInboundStore implements InboundMessageStore {
  constructor(private readonly sql: SqlExecutor) {}

  async saveIfNew(r: InboundRecord): Promise<boolean> {
    const result = await this.sql.query(
      `INSERT INTO ewds_inbound_message (message_id, topic_name, sender, received_at, payload, status)
       VALUES ($1, $2, $3, $4::timestamptz, $5, $6)
       ON CONFLICT (message_id) DO NOTHING
       RETURNING message_id`,
      [
        r.messageId,
        r.topicName,
        r.sender,
        r.receivedAt,
        r.payload,
        r.status,
      ],
    );
    return result.rows.length > 0;
  }

  async mark(
    messageId: string,
    status: "processed" | "rejected",
  ): Promise<void> {
    await this.sql.query(
      `UPDATE ewds_inbound_message SET status = $2, payload = NULL WHERE message_id = $1`,
      [messageId, status],
    );
  }

  async purge(now: Date, maxAgeMs = MAX_RETENTION_MS): Promise<number> {
    assertRetention(maxAgeMs);
    const cutoff = new Date(now.getTime() - maxAgeMs).toISOString();
    await this.sql.query(
      `UPDATE ewds_inbound_message
       SET payload = NULL
       WHERE status IN ('processed', 'rejected')`,
    );
    const deleted = await this.sql.query(
      `DELETE FROM ewds_inbound_message
       WHERE received_at < $1::timestamptz
       RETURNING message_id`,
      [cutoff],
    );
    return deleted.rows.length;
  }
}

function assertRetention(maxAgeMs: number): void {
  if (maxAgeMs > MAX_RETENTION_MS) {
    throw new Error("retention above 7 days");
  }
}