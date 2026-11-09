import { randomUUID } from "node:crypto";
import type {
  DomainEventEnvelope,
  OutboxRow,
  OutboxStore,
} from "./outbox.types.js";

export type AppendOutboxInput = {
  aggregateType: string;
  aggregateId: string;
  type: string;
  producer: string;
  communityId: string;
  billingMode: "live" | "virtual";
  data: Record<string, unknown>;
  eventId?: string;
  occurredAt?: string;
};

/**
 * Writes the domain event to the outbox in the same unit of work as business data.
 * Debezium (INT-132) publishes to NATS; business code never publishes directly (TD-7).
 */
export class OutboxService {
  constructor(private readonly store: OutboxStore) {}

  /**
   * Build the envelope and the outbox row without writing.
   * INT-356 — the recording transaction inserts the row in the same
   * database transaction as the business rows.
   */
  stage(input: AppendOutboxInput): { event: DomainEventEnvelope; row: OutboxRow } {
    const event: DomainEventEnvelope = {
      eventId: input.eventId ?? randomUUID(),
      type: input.type,
      version: 1,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      producer: input.producer,
      communityId: input.communityId,
      billingMode: input.billingMode,
      data: input.data,
    };
    const row: OutboxRow = {
      id: randomUUID(),
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      event,
      createdAt: new Date().toISOString(),
    };
    return { event, row };
  }

  async append(input: AppendOutboxInput): Promise<DomainEventEnvelope> {
    const staged = this.stage(input);
    await this.store.append(staged.row);
    return staged.event;
  }
}
