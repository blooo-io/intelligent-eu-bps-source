import { describe, expect, it, vi } from "vitest";
import {
  IdempotentConsumer,
  InMemoryProcessedEventsStore,
} from "@intelligent/module-template";
import { InMemoryEventBus } from "./in-memory-event-bus.js";
import {
  mapEnvelope,
  SettlementCompletedListener,
} from "./settlement-completed.listener.js";

describe("SettlementCompletedListener (INT-223)", () => {
  it("maps AsyncAPI envelope pairSettlementIds", () => {
    expect(
      mapEnvelope({
        eventId: "e1",
        data: { runId: "r1", pairSettlementIds: ["s1", "s2"] },
      }),
    ).toEqual({ eventId: "e1", pairSettlementIds: ["s1", "s2"] });
  });

  it("hydrates each pair and calls createFromSettlement once per id", async () => {
    const bus = new InMemoryEventBus();
    const createFromSettlement = vi.fn(async () => ({ invoiceId: "i1" }));
    const invoicing = { createFromSettlement } as never;
    const getPairSettlement = vi.fn(async (id: string) => ({
      settlementId: id,
      runId: "r1",
      consumerId: "c1",
      producerId: "p1",
      tradeIds: ["t1"],
      kWh: "10",
      energyAmount: "5.00",
      vat: "0.00",
      currency: "EUR",
      rate: "1",
      communityId: "comm-1",
    }));
    const settlements = { getPairSettlement } as never;
    const consumer = new IdempotentConsumer(new InMemoryProcessedEventsStore());
    const listener = new SettlementCompletedListener(
      bus,
      invoicing,
      settlements,
      consumer,
    );
    await listener.onModuleInit();

    await bus.publish("SettlementCompleted", {
      eventId: "evt-settlement-1",
      data: { runId: "r1", pairSettlementIds: ["s-a", "s-b"] },
    });

    expect(getPairSettlement).toHaveBeenCalledWith("s-a");
    expect(getPairSettlement).toHaveBeenCalledWith("s-b");
    expect(createFromSettlement).toHaveBeenCalledTimes(2);

    // Idempotent on eventId — second delivery is a no-op.
    await bus.publish("SettlementCompleted", {
      eventId: "evt-settlement-1",
      data: { runId: "r1", pairSettlementIds: ["s-a", "s-b"] },
    });
    expect(createFromSettlement).toHaveBeenCalledTimes(2);
  });

  it("skips envelopes without eventId", async () => {
    const bus = new InMemoryEventBus();
    const createFromSettlement = vi.fn(async () => null);
    const listener = new SettlementCompletedListener(
      bus,
      { createFromSettlement } as never,
      { getPairSettlement: vi.fn() } as never,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
    );
    await listener.onModuleInit();
    await bus.publish("SettlementCompleted", {
      data: { pairSettlementIds: ["s1"] },
    });
    expect(createFromSettlement).not.toHaveBeenCalled();
  });

  it("rethrows when createFromSettlement fails", async () => {
    const bus = new InMemoryEventBus();
    const listener = new SettlementCompletedListener(
      bus,
      {
        createFromSettlement: vi.fn(async () => {
          throw new Error("stripe down");
        }),
      } as never,
      {
        getPairSettlement: vi.fn(async (id: string) => ({
          settlementId: id,
          runId: "r1",
          consumerId: "c1",
          producerId: "p1",
          tradeIds: [],
          kWh: "0",
          energyAmount: "1.00",
          vat: "0",
          currency: "EUR",
          rate: "1",
          communityId: "c",
        })),
      } as never,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
    );
    await listener.onModuleInit();
    await expect(
      bus.publish("SettlementCompleted", {
        eventId: "evt-fail",
        data: { pairSettlementIds: ["s1"] },
      }),
    ).rejects.toThrow("stripe down");
  });
});

