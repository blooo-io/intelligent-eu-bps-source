export const EVENT_BUS_PORT = Symbol("EVENT_BUS_PORT");

export type EventHandler = (payload: unknown) => Promise<void>;

/**
 * Inbound event transport for AC-11 (INT-209 / TD-7).
 * Production: NATS JetStream subscription after Debezium publishes outbox rows.
 */
export interface EventBusPort {
  subscribe(subject: string, handler: EventHandler): Promise<void>;
  /** Test / local drain — no-op on real NATS. */
  publish?(subject: string, payload: unknown): Promise<void>;
}
