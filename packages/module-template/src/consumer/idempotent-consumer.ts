export interface ProcessedEventsStore {
  has(eventId: string): Promise<boolean>;
  /** Claim the event id. False means another delivery already owns it. */
  claim(eventId: string): Promise<boolean>;
  /** Drop a claim so a failed delivery can be retried (NFR-006). */
  release(eventId: string): Promise<void>;
}

export class InMemoryProcessedEventsStore implements ProcessedEventsStore {
  private readonly seen = new Set<string>();

  async has(eventId: string): Promise<boolean> {
    return this.seen.has(eventId);
  }

  async claim(eventId: string): Promise<boolean> {
    if (this.seen.has(eventId)) return false;
    this.seen.add(eventId);
    return true;
  }

  async release(eventId: string): Promise<void> {
    this.seen.delete(eventId);
  }
}

export type EventHandler<T> = (payload: T) => Promise<void>;

export type ConsumeResult =
  | { status: "processed" }
  | { status: "duplicate" }
  | { status: "failed"; error: Error };

/**
 * At-least-once consumer with dedupe on eventId (03 §4 / TD-7 / INT-339).
 * The claim is released when the handler throws so JetStream can redeliver (NFR-006).
 */
export class IdempotentConsumer {
  constructor(private readonly processed: ProcessedEventsStore) {}

  async handle<T>(
    eventId: string,
    payload: T,
    handler: EventHandler<T>,
  ): Promise<ConsumeResult> {
    const claimed = await this.processed.claim(eventId);
    if (!claimed) {
      return { status: "duplicate" };
    }
    try {
      await handler(payload);
      return { status: "processed" };
    } catch (error) {
      await this.processed.release(eventId);
      return {
        status: "failed",
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}
