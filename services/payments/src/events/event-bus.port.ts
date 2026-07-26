export const EVENT_BUS_PORT = Symbol("EVENT_BUS_PORT");

export type EventHandler = (payload: unknown) => Promise<void>;

/** Inbound event transport for AC-07 (INT-275 / TD-7). */
export interface EventBusPort {
  subscribe(subject: string, handler: EventHandler): Promise<void>;
  publish?(subject: string, payload: unknown): Promise<void>;
}
