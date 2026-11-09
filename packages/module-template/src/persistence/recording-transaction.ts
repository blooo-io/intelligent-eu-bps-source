import { PostgresOutboxStore, type SqlExecutor } from "../outbox/postgres-outbox.store.js";
import type { OutboxRow } from "../outbox/outbox.types.js";
import type { AppendOutboxInput, OutboxService } from "../outbox/outbox.service.js";
import { inTransaction, type TransactionClient } from "./in-transaction.js";

/**
 * A store that can replay its mutations inside one database transaction
 * and roll the in-memory copy back when that transaction fails (INT-356).
 */
export type RecordableStore<W> = {
  beginRecording(): void;
  takeRecording(): W[];
  stopRecording(): void;
  snapshot(): string;
  restore(snapshot: string): void;
};

/**
 * INT-356 — runs `fn` against the in-memory store. When a database is
 * configured, the mutations and the outbox rows `fn` stages are committed
 * together. A failed commit restores the in-memory snapshot.
 * Without a database this is a passthrough, so unit tests stay in memory.
 */
export class RecordingTransaction<W> {
  private active = false;
  private tail: Promise<void> = Promise.resolve();
  private originalAppend: OutboxService["append"] | null = null;

  constructor(
    private readonly store: RecordableStore<W>,
    private readonly outbox: OutboxService,
    private readonly connect: (() => Promise<TransactionClient>) | null,
    private readonly apply: (sql: SqlExecutor, writes: W[]) => Promise<void>,
  ) {}

  async run<T>(fn: () => Promise<T> | T): Promise<T> {
    if (!this.connect || this.active) {
      return await fn();
    }
    // One transaction at a time: concurrent requests wait, so the outbox
    // hook and the recording buffer stay bound to a single caller.
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await this.runExclusive(fn);
    } finally {
      release();
    }
  }

  private async runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    this.active = true;
    const snapshot = this.store.snapshot();
    this.store.beginRecording();
    const rows: OutboxRow[] = [];
    this.originalAppend = this.outbox.append.bind(this.outbox);
    this.outbox.append = (async (input: AppendOutboxInput) => {
      const staged = this.outbox.stage(input);
      rows.push(staged.row);
      return staged.event;
    }) as OutboxService["append"];
    try {
      const result = await fn();
      const writes = this.store.takeRecording();
      if (writes.length > 0 || rows.length > 0) {
        await inTransaction(this.connect!, async (sql) => {
          if (writes.length > 0) await this.apply(sql, writes);
          const box = new PostgresOutboxStore(sql);
          for (const row of rows) await box.append(row);
        });
      }
      return result;
    } catch (error) {
      this.store.restore(snapshot);
      throw error;
    } finally {
      if (this.originalAppend) this.outbox.append = this.originalAppend;
      this.originalAppend = null;
      this.store.stopRecording();
      this.active = false;
    }
  }
}

/** No database: run the work and leave the in-memory outbox as the only copy. */
export class PassthroughTransaction {
  async run<T>(fn: () => Promise<T> | T): Promise<T> {
    return await fn();
  }
}
