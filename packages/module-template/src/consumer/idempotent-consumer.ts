export interface ProcessedEventsStore {
  has(eventId: string): Promise<boolean>;
  mark(eventId: string): Promise<void>;
}

export class InMemoryProcessedEventsStore implements ProcessedEventsStore {
  private readonly seen = new Set<string>();

  async has(eventId: string): Promise<boolean> {
    return this.seen.has(eventId);
  }

  async mark(eventId: string): Promise<void> {
    this.seen.add(eventId);
  }
}

export type EventHandler<T> = (payload: T) => Promise<void>;

export type ConsumeResult =
  | { status: "processed" }
  | { status: "duplicate" }
  | { status: "failed"; error: Error };

/**
 * At-least-once consumer with dedupe on eventId (03 §4 / TD-7).
 * Failures are not marked processed so the message can be retried (NFR-006 / UAT-038).
 */
export class IdempotentConsumer {
  constructor(private readonly processed: ProcessedEventsStore) {}

  async handle<T>(
    eventId: string,
    payload: T,
    handler: EventHandler<T>,
  ): Promise<ConsumeResult> {
    if (await this.processed.has(eventId)) {
      return { status: "duplicate" };
    }
    try {
      await handler(payload);
      await this.processed.mark(eventId);
      return { status: "processed" };
    } catch (error) {
      return {
        status: "failed",
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}
