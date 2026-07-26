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
    apply = vi.fn().mockResolvedValue({ result: "completed" });
    const participants = { applyErasureRequested: apply };
    const consumer = new IdempotentConsumer(new InMemoryProcessedEventsStore());
    listener = new ErasureRequestedListener(
      bus,
      participants as never,
      consumer,
    );
    await listener.onModuleInit();
  });

  it("forwards ErasureRequested to ParticipantsService", async () => {
    await bus.publish("ErasureRequested", {
      eventId: "evt-er-1",
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

  it("is idempotent on redelivery", async () => {
    const envelope = {
      eventId: "evt-er-2",
      data: { requestId: "req-2", participantId: "part-2" },
    };
    await bus.publish("ErasureRequested", envelope);
    await bus.publish("ErasureRequested", envelope);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("skips envelopes without participantId", async () => {
    await bus.publish("ErasureRequested", {
      eventId: "evt-er-3",
      data: { requestId: "req-3" },
    });
    expect(apply).not.toHaveBeenCalled();
  });
});
