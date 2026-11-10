import { describe, expect, it, vi } from "vitest";
import {
  IdempotentConsumer,
  InMemoryProcessedEventsStore,
} from "@intelligent/module-template";
import { InMemoryEventBus } from "./in-memory-event-bus.js";
import {
  isNonRetryableInvoiceError,
  mapEnvelope,
  SettlementCompletedListener,
  unwrapEnvelope,
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

  it("unwraps JSON converter {schema,payload}", () => {
    expect(
      unwrapEnvelope({
        schema: { type: "struct" },
        payload: {
          eventId: "e2",
          data: { pairSettlementIds: ["s9"] },
        },
      }),
    ).toMatchObject({ eventId: "e2" });
    expect(
      mapEnvelope({
        schema: {},
        payload: {
          eventId: "e2",
          data: { pairSettlementIds: ["s9"] },
        },
      }),
    ).toEqual({ eventId: "e2", pairSettlementIds: ["s9"] });
  });

  it("unwraps CloudEvents id + data envelope", () => {
    expect(
      mapEnvelope({
        id: "outbox-row-id",
        source: "debezium",
        type: "SettlementCompleted",
        data: {
          eventId: "e3",
          data: { pairSettlementIds: ["s3"] },
        },
      }),
    ).toEqual({ eventId: "e3", pairSettlementIds: ["s3"] });
  });

  it("falls back to CloudEvents id when data is data-only", () => {
    expect(
      mapEnvelope({
        id: "outbox-row-id",
        data: { runId: "r1", pairSettlementIds: ["s4"] },
      }),
    ).toEqual({ eventId: "outbox-row-id", pairSettlementIds: ["s4"] });
  });

  it("parses string JSON and CDC after.event", () => {
    expect(
      mapEnvelope(
        JSON.stringify({
          eventId: "e-str",
          data: { pairSettlementIds: ["s5"] },
        }),
      ),
    ).toEqual({ eventId: "e-str", pairSettlementIds: ["s5"] });

    expect(
      mapEnvelope({
        after: {
          id: "row",
          event: JSON.stringify({
            eventId: "e-cdc",
            data: { pairSettlementIds: ["s6"] },
          }),
        },
      }),
    ).toEqual({ eventId: "e-cdc", pairSettlementIds: ["s6"] });
  });

  it("synthesizes eventId from runId + pair ids when envelope id missing", () => {
    expect(
      mapEnvelope({
        data: { runId: "run-9", pairSettlementIds: ["s7", "s8"] },
      }),
    ).toEqual({
      eventId: "settlement:run-9:s7,s8",
      pairSettlementIds: ["s7", "s8"],
    });
  });

  it("uses CloudEvents id when data has neither eventId nor pairs", () => {
    expect(
      mapEnvelope({
        id: "ce-only",
        data: { foo: "bar" },
      }),
    ).toEqual({ eventId: "ce-only", pairSettlementIds: [] });
  });

  it("reads flattened pairSettlementIds on the root", () => {
    expect(
      mapEnvelope({
        eventId: "flat",
        pairSettlementIds: ["s-flat"],
      }),
    ).toEqual({ eventId: "flat", pairSettlementIds: ["s-flat"] });
  });

  it("synthesizes eventId with unknown runId", () => {
    expect(
      mapEnvelope({
        data: { pairSettlementIds: ["sx"] },
      }),
    ).toEqual({
      eventId: "settlement:unknown:sx",
      pairSettlementIds: ["sx"],
    });
  });

  it("returns empty on invalid JSON string", () => {
    expect(mapEnvelope("not-json{")).toEqual({
      eventId: "",
      pairSettlementIds: [],
    });
  });

  it("acks empty pairSettlementIds without calling settlement", async () => {
    const bus = new InMemoryEventBus();
    const getPairSettlement = vi.fn();
    const createFromSettlement = vi.fn();
    const listener = new SettlementCompletedListener(
      bus,
      { createFromSettlement } as never,
      { getPairSettlement } as never,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
    );
    await listener.onModuleInit();
    await bus.publish("SettlementCompleted", {
      eventId: "evt-empty",
      data: { runId: "r", pairSettlementIds: [] },
    });
    expect(getPairSettlement).not.toHaveBeenCalled();
    expect(createFromSettlement).not.toHaveBeenCalled();
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
      rate: "1.0000",
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
      data: { pairSettlementIds: [] },
    });
    expect(createFromSettlement).not.toHaveBeenCalled();
  });

  it("rethrows when createFromSettlement fails with retryable error", async () => {
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
          rate: "1.0000",
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

  it("acks non-retryable Stripe Connect account errors without rethrow", async () => {
    const bus = new InMemoryEventBus();
    const listener = new SettlementCompletedListener(
      bus,
      {
        createFromSettlement: vi.fn(async () => {
          throw new Error(
            "The provided key does not have access to account 'acct_test_abc'",
          );
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
          rate: "1.0000",
          communityId: "c",
        })),
      } as never,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
    );
    await listener.onModuleInit();
    await expect(
      bus.publish("SettlementCompleted", {
        eventId: "evt-poison",
        data: { pairSettlementIds: ["s1"] },
      }),
    ).resolves.toBeUndefined();
  });

  it("classifies Stripe account errors as non-retryable", () => {
    expect(
      isNonRetryableInvoiceError(
        new Error("does not have access to account 'acct_xyz'"),
      ),
    ).toBe(true);
    expect(isNonRetryableInvoiceError(new Error("timeout"))).toBe(false);
  });

  it("INT-231 — readiness / charges_enabled stay retryable", () => {
    expect(
      isNonRetryableInvoiceError(
        new Error("producer charges_enabled not ready (retry until KYC completes)"),
      ),
    ).toBe(false);
    expect(
      isNonRetryableInvoiceError(new Error("producer_not_ready")),
    ).toBe(false);
    expect(
      isNonRetryableInvoiceError(
        new Error("producer Connect account required (provision via AC-07)"),
      ),
    ).toBe(false);
    expect(
      isNonRetryableInvoiceError(new Error("acct_test_poison")),
    ).toBe(true);
  });

  it("INT-368 — a 404 from AC-05 GetPairSettlement is not retried", () => {
    expect(
      isNonRetryableInvoiceError(
        new Error("settlement getPairSettlement cd9ec59e-5f6a failed with 404"),
      ),
    ).toBe(true);
    expect(
      isNonRetryableInvoiceError(
        new Error("settlement getPairSettlement cd9ec59e-5f6a failed with 503"),
      ),
    ).toBe(false);
  });
});
