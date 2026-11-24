import type { BillingCommandReply } from "./billing-command.types.js";

/** REQ-053 — processed command replies retained at most 7 days. */
export const PROCESSED_COMMAND_RETENTION_MS = 7 * 24 * 3600 * 1000;

export interface ProcessedCommandsStore {
  get(requestId: string): Promise<BillingCommandReply | null>;
  put(
    requestId: string,
    reply: BillingCommandReply,
    at?: Date,
  ): Promise<void>;
  purge(now: Date, maxAgeMs?: number): Promise<number>;
}

type Row = {
  reply: BillingCommandReply;
  storedAtMs: number;
};

/**
 * In-memory idempotency store for EWDS command replies (requestId → reply).
 * REQ-053 — purge drops entries older than 7 days.
 */
export class InMemoryProcessedCommandsStore implements ProcessedCommandsStore {
  private readonly rows = new Map<string, Row>();

  async get(requestId: string): Promise<BillingCommandReply | null> {
    const row = this.rows.get(requestId);
    return row ? structuredClone(row.reply) : null;
  }

  async put(
    requestId: string,
    reply: BillingCommandReply,
    at: Date = new Date(),
  ): Promise<void> {
    this.rows.set(requestId, {
      reply: structuredClone(reply),
      storedAtMs: at.getTime(),
    });
  }

  async purge(
    now: Date,
    maxAgeMs: number = PROCESSED_COMMAND_RETENTION_MS,
  ): Promise<number> {
    if (maxAgeMs > PROCESSED_COMMAND_RETENTION_MS) {
      throw new Error("retention above 7 days");
    }
    const cutoff = now.getTime() - maxAgeMs;
    let removed = 0;
    for (const [id, row] of this.rows) {
      if (row.storedAtMs < cutoff) {
        this.rows.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  /** Test helper — current size. */
  size(): number {
    return this.rows.size;
  }
}
