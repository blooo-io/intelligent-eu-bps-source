import { describe, expect, it, vi } from "vitest";
import { InMemoryEventBus } from "./in-memory-event-bus.js";

describe("InMemoryEventBus", () => {
  it("publish is a no-op when no handlers are registered", async () => {
    const bus = new InMemoryEventBus();
    await bus.publish("Unhandled", { ok: true });
    expect(bus.published).toHaveLength(1);
  });

  it("invokes every handler registered for the subject", async () => {
    const bus = new InMemoryEventBus();
    const first = vi.fn();
    const second = vi.fn();
    await bus.subscribe("InvoiceIssued", first);
    await bus.subscribe("InvoiceIssued", second);
    await bus.publish("InvoiceIssued", { a: 1 });
    expect(first).toHaveBeenCalledWith({ a: 1 });
    expect(second).toHaveBeenCalledWith({ a: 1 });
  });
});