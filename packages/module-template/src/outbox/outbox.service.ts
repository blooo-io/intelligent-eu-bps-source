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

  async append(input: AppendOutboxInput): Promise<DomainEventEnvelope> {
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
    await this.store.append(row);
    return event;
  }
}
