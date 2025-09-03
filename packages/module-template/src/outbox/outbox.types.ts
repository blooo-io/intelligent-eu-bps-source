/** Domain event envelope (contracts/asyncapi/components/envelope.schema.json, 03 §4). */
export type DomainEventEnvelope = {
  eventId: string;
  type: string;
  version: 1;
  occurredAt: string;
  producer: string;
  communityId: string;
  billingMode: "live" | "virtual";
  data: Record<string, unknown>;
};

export type OutboxRow = {
  id: string;
  aggregateType: string;
  aggregateId: string;
  event: DomainEventEnvelope;
  createdAt: string;
};

/**
 * Append-only outbox store. Updates and deletes are intentionally absent
 * so records stay immutable (NFR-003 / UAT-035 / BR-13 pattern).
 */
export interface OutboxStore {
  append(row: OutboxRow): Promise<void>;
  list(): Promise<readonly OutboxRow[]>;
}

export class InMemoryOutboxStore implements OutboxStore {
  private readonly rows: OutboxRow[] = [];

  async append(row: OutboxRow): Promise<void> {
    this.rows.push(structuredClone(row));
  }

  async list(): Promise<readonly OutboxRow[]> {
    return this.rows.map((row) => structuredClone(row));
  }
}
