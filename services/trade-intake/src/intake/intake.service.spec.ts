/**
 * INT-104 / INT-117 / INT-118 / INT-119 — BR-01, BR-02, BR-11, REQ-001, REQ-029.
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import { createMockSuite } from "@intelligent/mocks";
import {
  InMemoryOutboxStore,
  OutboxService,
  StaticBillingModeResolver,
} from "@intelligent/module-template";
import { TradeStore } from "../domain/store.js";
import { FixturePartyResolver } from "../party/fixture-party-resolver.js";
import { IntakeService } from "./intake.service.js";

const WINDOW = {
  from: "2026-11-01T00:00:00Z",
  to: "2026-11-02T00:00:00Z",
};

describe("IntakeService", () => {
  let store: TradeStore;
  let outboxStore: InMemoryOutboxStore;
  let service: IntakeService;

  beforeEach(() => {
    const suite = createMockSuite("S1");
    const actors = new Set(
      suite.scenario.trades.flatMap((t) => [t.buyerActorId, t.sellerActorId]),
    );
    store = new TradeStore();
    outboxStore = new InMemoryOutboxStore();
    service = new IntakeService(
      store,
      new OutboxService(outboxStore),
      new FixturePartyResolver(suite.scenario.communityId, actors),
    );
    service.useSuite(suite);
  });

  it("REQ-043: TradesIngested carries community mode", async () => {
    const suite = createMockSuite("S1");
    const actors = new Set(
      suite.scenario.trades.flatMap((t) => [t.buyerActorId, t.sellerActorId]),
    );
    const liveOutbox = new InMemoryOutboxStore();
    const liveService = new IntakeService(
      new TradeStore(),
      new OutboxService(liveOutbox),
      new FixturePartyResolver(suite.scenario.communityId, actors),
      new StaticBillingModeResolver("live"),
    );
    liveService.useSuite(suite);
    await liveService.refreshIntake(WINDOW);
    const events = await liveOutbox.list();
    const ingested = events.find((e) => e.event.type === "TradesIngested");
    expect(ingested?.event.billingMode).toBe("live");
  });

  it("stores each settled trade once and keeps market status (BR-01, BR-11)", async () => {
    const first = await service.refreshIntake(WINDOW);
    expect(first.ingested).toBe(2);
    const second = await service.refreshIntake(WINDOW);
    expect(second.ingested).toBe(0);
    expect(store.size()).toBe(2);

    const unbilled = service.getUnbilledTrades({
      until: "2026-11-02T00:00:00Z",
      communityId: createMockSuite("S1").scenario.communityId,
    });
    expect(unbilled).toHaveLength(2);
    for (const t of unbilled) {
      expect(t.status).toBe("settled");
    }
    // BR-11: status never rewritten on re-ingest.
    const before = store.get(unbilled[0].tradeId)!;
    store.insertOnce({ ...before, status: "open" });
    expect(store.get(unbilled[0].tradeId)!.status).toBe("settled");

    const events = await outboxStore.list();
    expect(events.map((e) => e.event.type)).toContain("TradesIngested");
  });

  it("copies delivery period from the market (BR-02)", async () => {
    await service.refreshIntake(WINDOW);
    const [trade] = service.getUnbilledTrades({
      until: "2026-11-02T00:00:00Z",
      communityId: createMockSuite("S1").scenario.communityId,
    });
    const market = createMockSuite("S1").scenario.markets[0];
    expect(trade.deliveryStart).toBe(market.deliveryStart);
    expect(trade.deliveryEnd).toBe(market.deliveryEnd);
  });

  it("filters unbilled by pair and excludes billed trades (REQ-001)", async () => {
    await service.refreshIntake(WINDOW);
    const suite = createMockSuite("S1");
    const consumer = suite.scenario.trades[0].buyerActorId;
    const producer = suite.scenario.trades[0].sellerActorId;
    const pair = service.getUnbilledTrades({
      until: "2026-11-02T00:00:00Z",
      consumerId: consumer,
      producerId: producer,
    });
    expect(pair).toHaveLength(1);
    service.markBilled([pair[0].tradeId]);
    expect(
      service.getUnbilledTrades({
        until: "2026-11-02T00:00:00Z",
        consumerId: consumer,
        producerId: producer,
      }),
    ).toHaveLength(0);
  });

  it("S7 / UAT-001 — duplicate tradeId in one feed is stored once (REQ-001)", async () => {
    const suite = createMockSuite("S7");
    const actors = new Set(
      suite.scenario.trades.flatMap((t) => [t.buyerActorId, t.sellerActorId]),
    );
    service = new IntakeService(
      store,
      new OutboxService(outboxStore),
      new FixturePartyResolver(suite.scenario.communityId, actors),
    );
    service.useSuite(suite);
    const result = await service.refreshIntake(WINDOW);
    expect(result.ingested).toBe(1);
    expect(store.size()).toBe(1);
  });

  it("emits IntakeAnomalyDetected for unknown parties (S4)", async () => {
    const suite = createMockSuite("S4");
    const known = new Set(
      suite.scenario.trades
        .filter((t) => !t.unknownParty)
        .flatMap((t) => [t.buyerActorId, t.sellerActorId]),
    );
    // Only resolve known parties — leave unknown out.
    service = new IntakeService(
      store,
      new OutboxService(outboxStore),
      new FixturePartyResolver(suite.scenario.communityId, known),
    );
    service.useSuite(suite);
    await service.refreshIntake(WINDOW);
    expect(service.listAnomalies().some((a) => a.type === "unknown_party")).toBe(
      true,
    );
    const events = await outboxStore.list();
    expect(events.map((e) => e.event.type)).toContain("IntakeAnomalyDetected");
  });

  it("checkIntakeHealth flags trade count mismatch (REQ-029)", async () => {
    // No refresh → zero stored vs clearing numTrades=2.
    await service.checkIntakeHealth();
    expect(
      service.listAnomalies().some((a) => a.type === "trade_count_mismatch"),
    ).toBe(true);
  });

  it("rejects incomplete unbilled query", () => {
    expect(() =>
      service.getUnbilledTrades({ until: "2026-11-02T00:00:00Z" }),
    ).toThrow(/communityId/);
  });

  it("rejects unbilled query without until", () => {
    expect(() =>
      service.getUnbilledTrades({
        until: "",
        communityId: createMockSuite("S1").scenario.communityId,
      }),
    ).toThrow(/until is required/);
  });

  it("rejects refresh without a valid window", async () => {
    await expect(
      service.refreshIntake({ from: "", to: WINDOW.to }),
    ).rejects.toThrow(/from and to are required/);
    await expect(
      service.refreshIntake({ from: WINDOW.to, to: WINDOW.from }),
    ).rejects.toThrow(/from must be before to/);
  });

  it("skips non-settled fixtures (BR-01 defence)", async () => {
    const suite = createMockSuite("S1");
    const trade = suite.scenario.trades[0];
    service.useSuite({
      ...suite,
      market: {
        ...suite.market,
        queryTrades: () => [{ ...trade, status: "open" }],
      },
    });
    const result = await service.refreshIntake(WINDOW);
    expect(result.ingested).toBe(0);
  });

  it("uses trade delivery when market row is absent (BR-02 fallback)", async () => {
    const suite = createMockSuite("S1");
    const trade = suite.scenario.trades[0];
    service.useSuite({
      ...suite,
      market: {
        ...suite.market,
        queryMarkets: () => [],
        queryTrades: () => [trade],
      },
    });
    await service.refreshIntake(WINDOW);
    const row = store.get(trade.tradeId)!;
    expect(row.deliveryStart).toBe(trade.deliveryStart);
    expect(row.deliveryEnd).toBe(trade.deliveryEnd);
  });

  it("marks billed and resetBilled for operator re-seed (INT-232)", () => {
    store.insertOnce({
      tradeId: "t-1",
      marketId: "m-1",
      buyerActorId: "b",
      sellerActorId: "s",
      consumerId: "c",
      producerId: "p",
      communityId: createMockSuite("S1").scenario.communityId,
      kWh: "1.00",
      price: "0.10",
      status: "settled",
      deliveryStart: WINDOW.from,
      deliveryEnd: WINDOW.to,
      billed: true,
    });
    expect(service.resetBilled()).toEqual({ cleared: true });
    expect(store.get("t-1")!.billed).toBe(false);
    expect(() => service.markBilled([])).toThrow(/tradeIds is required/);
  });

  it("checkIntakeHealth passes when stored trades match clearing", async () => {
    await service.refreshIntake(WINDOW);
    await service.checkIntakeHealth();
    expect(
      service.listAnomalies().some((a) => a.type === "trade_count_mismatch"),
    ).toBe(false);
  });

  it("checkIntakeHealth records missing_clearing anomalies", async () => {
    const suite = createMockSuite("S1");
    const market = suite.scenario.markets[0];
    service.useSuite({
      ...suite,
      market: {
        ...suite.market,
        queryMarkets: () => [market],
        queryClearingResults: () => {
          throw new Error("no clearing");
        },
      },
    });
    await service.checkIntakeHealth();
    expect(
      service.listAnomalies().some((a) => a.type === "missing_clearing"),
    ).toBe(true);
  });

  it("omits null party ids from unbilled DTOs", async () => {
    await service.refreshIntake(WINDOW);
    const tradeId = createMockSuite("S1").scenario.trades[0].tradeId;
    const row = store.get(tradeId)!;
    store.insertOnce({ ...row, tradeId: "null-party", consumerId: null, producerId: null });
    const dto = service
      .getUnbilledTrades({
        until: WINDOW.to,
        communityId: createMockSuite("S1").scenario.communityId,
      })
      .find((t) => t.tradeId === "null-party");
    expect(dto?.consumerId).toBeUndefined();
    expect(dto?.producerId).toBeUndefined();
  });
});
