import { describe, expect, it, vi } from "vitest";
import { InMemoryEventBus } from "./in-memory-event-bus.js";

describe("InMemoryEventBus", () => {
  it("invokes handlers and records published messages", async () => {
    const bus = new InMemoryEventBus();
    const handler = vi.fn();
    await bus.subscribe("TestSubject", handler);
    await bus.publish("TestSubject", { hello: true });
    expect(handler).toHaveBeenCalledWith({ hello: true });
    expect(bus.published).toEqual([{ subject: "TestSubject", payload: { hello: true } }]);
  });

  it("publishes without subscribers", async () => {
    const bus = new InMemoryEventBus();
    await bus.publish("Empty", { ok: 1 });
    expect(bus.published).toHaveLength(1);
  });
});