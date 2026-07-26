import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IdempotentConsumer,
  InMemoryProcessedEventsStore,
} from "@intelligent/module-template";
import { InMemoryEventBus } from "./in-memory-event-bus.js";
import { ErasureRequestedListener } from "./erasure-requested.listener.js";

describe("ErasureRequestedListener (INT-275)", () => {
  let bus: InMemoryEventBus;
  let apply: ReturnType<typeof vi.fn>;
  let listener: ErasureRequestedListener;

  beforeEach(async () => {
    bus = new InMemoryEventBus();
    apply = vi.fn().mockResolvedValue({ result: "completed", invoicesRetained: 1 });
    const invoicing = { applyErasureRequested: apply };
    const consumer = new IdempotentConsumer(new InMemoryProcessedEventsStore());
    listener = new ErasureRequestedListener(
      bus,
      invoicing as never,
      consumer,
    );
    await listener.onModuleInit();
  });

  it("forwards ErasureRequested to InvoicingService", async () => {
    await bus.publish("ErasureRequested", {
      eventId: "evt-er-inv-1",
      data: {
        requestId: "req-1",
        participantId: "part-1",
      },
    });
    expect(apply).toHaveBeenCalledWith({
      requestId: "req-1",
      participantId: "part-1",
    });
  });

  it("skips when eventId is missing", async () => {
    await bus.publish("ErasureRequested", {
      data: { requestId: "req-x", participantId: "part-x" },
    });
    expect(apply).not.toHaveBeenCalled();
  });

  it("is idempotent on redelivery", async () => {
    const envelope = {
      eventId: "evt-er-inv-2",
      data: { requestId: "req-2", participantId: "part-2" },
    };
    await bus.publish("ErasureRequested", envelope);
    await bus.publish("ErasureRequested", envelope);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
