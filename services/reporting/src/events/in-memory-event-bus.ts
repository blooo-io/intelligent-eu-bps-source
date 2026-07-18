import { Injectable } from "@nestjs/common";
import type { EventBusPort, EventHandler } from "./event-bus.port.js";

/** CI / unit-test bus — records handlers and supports in-process publish. */
@Injectable()
export class InMemoryEventBus implements EventBusPort {
  private readonly handlers = new Map<string, EventHandler[]>();
  readonly published: Array<{ subject: string; payload: unknown }> = [];

  async subscribe(subject: string, handler: EventHandler): Promise<void> {
    const list = this.handlers.get(subject) ?? [];
    list.push(handler);
    this.handlers.set(subject, list);
  }

  async publish(subject: string, payload: unknown): Promise<void> {
    this.published.push({ subject, payload });
    for (const handler of this.handlers.get(subject) ?? []) {
      await handler(payload);
    }
  }
}
