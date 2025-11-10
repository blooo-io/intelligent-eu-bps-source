/**
 * INT-105 — BR-03..BR-08, BR-12, BR-13 settlement runs.
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import { createMockSuite } from "@intelligent/mocks";
import {
  InMemoryOutboxStore,
  OutboxService,
} from "@intelligent/module-template";
import { SettlementStore } from "../domain/store.js";
import { FixtureTradeSource } from "../ports/fixture-trade-source.js";
import { SettlementService } from "./settlement.service.js";

describe("SettlementService", () => {
  let store: SettlementStore;
  let outboxStore: InMemoryOutboxStore;
  let trades: FixtureTradeSource;
  let service: SettlementService;
  let communityId: string;

  beforeEach(() => {
    store = new SettlementStore();
    outboxStore = new InMemoryOutboxStore();
    trades = new FixtureTradeSource("S1");
    service = new SettlementService(
      store,
      new OutboxService(outboxStore),
      trades,
    );
    communityId = createMockSuite("S1").scenario.communityId;
  });

  it("S1: two producers → two pair settlements (BR-03)", async () => {
    // Fixture amounts are < 5 €; lower threshold to exercise invoicing path.
    service.useFixtureScenario("S1", { threshold: 0.01 });
    const { runId } = await service.startRun({
      communityId,
      type: "periodic",
      period: "2026-11",
    });
    const run = store.getRun(runId)!;
    expect(run.settlementIds).toHaveLength(2);
    for (const id of run.settlementIds) {
      const s = service.getPairSettlement(id);
      expect(s.currency).toBe("EUR");
      expect(s.rate).toBe("1.00");
      expect(s.vat).toBe("0.00");
      expect(Number(s.energyAmount)).toBeGreaterThan(0);
    }
    const events = await outboxStore.list();
    expect(events.map((e) => e.event.type)).toEqual(
      expect.arrayContaining(["SettlementCompleted", "BillingRunCompleted"]),
    );
  });

  it("S2: nets purchases and sales of a pair (BR-04)", async () => {
    service.useFixtureScenario("S2", { threshold: 0.01 });
    communityId = trades.communityId();
    const { runId } = await service.startRun({
      communityId,
      type: "periodic",
      period: "2026-11",
    });
    const run = store.getRun(runId)!;
    expect(run.settlementIds).toHaveLength(1);
    const s = service.getPairSettlement(run.settlementIds[0]);
    // 8*0.2 - 3*0.2 = 1.00 EUR
    expect(s.energyAmount).toBe("1.00");
    expect(s.kWh).toBe("5.00");
  });

  it("S3: below threshold is carried forward (BR-05)", async () => {
    service.useFixtureScenario("S3");
    communityId = trades.communityId();
    const { runId } = await service.startRun({
      communityId,
      type: "periodic",
      period: "2026-11",
    });
    const s = service.getPairSettlement(store.getRun(runId)!.settlementIds[0]);
    expect(s.energyAmount).toBe("0.00");
    expect(Number(s.carriedForwardOut)).toBeGreaterThan(0);
    expect(Number(s.carriedForwardOut)).toBeLessThan(5);
  });

  it("early settlement ignores threshold (BR-05)", async () => {
    service.useFixtureScenario("S3");
    communityId = trades.communityId();
    const { runId } = await service.startRun({
      communityId,
      type: "early",
      period: "2026-11",
    });
    const s = service.getPairSettlement(store.getRun(runId)!.settlementIds[0]);
    expect(Number(s.energyAmount)).toBeGreaterThan(0);
    expect(s.carriedForwardOut).toBe("0.00");
  });

  it("does not overwrite a computed settlement (BR-13)", async () => {
    const { runId } = await service.startRun({
      communityId,
      type: "periodic",
      period: "2026-11",
    });
    const id = store.getRun(runId)!.settlementIds[0];
    const row = store.getSettlement(id)!;
    expect(() => store.appendSettlement(row)).toThrow(/already exists/);
  });

  it("rejects missing period for periodic runs", async () => {
    await expect(
      service.startRun({ communityId, type: "periodic" }),
    ).rejects.toThrow(/period/);
  });
});
