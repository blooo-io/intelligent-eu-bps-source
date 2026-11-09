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
import type { UnbilledTrade } from "../domain/types.js";
import { FixtureTradeSource } from "../ports/fixture-trade-source.js";
import type { TradeSourcePort } from "../ports/trade-source.port.js";
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

  it("INT-273: final run invoices below-threshold pairs (BR-05 / REQ-012)", async () => {
    service.useFixtureScenario("S3");
    communityId = trades.communityId();
    const consumerId = createMockSuite("S3").scenario.trades[0]!.buyerActorId;
    const { runId } = await service.startRun({
      communityId,
      type: "final",
      period: "2026-11",
      onlyParticipantId: consumerId,
    });
    const run = store.getRun(runId)!;
    expect(run.type).toBe("final");
    expect(run.settlementIds.length).toBeGreaterThan(0);
    const s = service.getPairSettlement(run.settlementIds[0]!);
    expect(Number(s.energyAmount)).toBeGreaterThan(0);
    expect(s.carriedForwardOut).toBe("0.00");
  });

  it("S8 / UAT-002 — CHF community uses ECB fixture rate (REQ-002)", async () => {
    service.useFixtureScenario("S8", { threshold: 0.01 });
    communityId = trades.communityId();
    const { runId } = await service.startRun({
      communityId,
      type: "periodic",
      period: "2026-11",
    });
    const run = store.getRun(runId)!;
    expect(run.settlementIds.length).toBeGreaterThan(0);
    const s = service.getPairSettlement(run.settlementIds[0]);
    expect(s.currency).toBe("CHF");
    // Fixture ECB rate 0.9412 from AC-15 S8, stored to two decimals (formatRate).
    expect(s.rate).toBe("0.94");
    expect(Number(s.energyAmount)).toBeGreaterThan(0);
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

  it("INT-278: rerun increments version for community+period (BR-13 / REQ-005)", async () => {
    service.useFixtureScenario("S1", { threshold: 0.01 });
    const first = await service.startRun({
      communityId,
      type: "periodic",
      period: "2026-11",
    });
    expect(store.getRun(first.runId)!.version).toBe(1);
    expect(
      service.getPairSettlement(store.getRun(first.runId)!.settlementIds[0]!)
        .version,
    ).toBe(1);
    await service.resetFixtureBilled();
    const second = await service.startRun({
      communityId,
      type: "periodic",
      period: "2026-11",
    });
    expect(store.getRun(second.runId)!.version).toBe(2);
    // History of version 1 is kept (append-only).
    expect(store.getRun(first.runId)!.version).toBe(1);
    const events = await outboxStore.list();
    const completed = events.filter((e) => e.event.type === "BillingRunCompleted");
    expect(completed.map((e) => e.event.data.version)).toEqual([1, 2]);
  });

  it("rejects missing period for periodic runs", async () => {
    await expect(
      service.startRun({ communityId, type: "periodic" }),
    ).rejects.toThrow(/period/);
  });

  it("INT-272: threshold from AC-03 settings drives carry-forward (BR-05)", async () => {
    service.useFixtureScenario("S1", { threshold: 0.01 });
    const settings = {
      async get() {
        return {
          currency: "EUR" as const,
          // High threshold → S1 fixture amounts stay below and carry forward.
          threshold: 100,
          vatRate: 0,
          billingMode: "virtual" as const,
        };
      },
    };
    service = new SettlementService(
      store,
      new OutboxService(outboxStore),
      trades,
      settings,
      null,
    );
    service.useFixtureScenario("S1");
    const { runId } = await service.startRun({
      communityId,
      type: "periodic",
      period: "2026-11",
    });
    for (const id of store.getRun(runId)!.settlementIds) {
      const s = service.getPairSettlement(id);
      expect(s.energyAmount).toBe("0.00");
      expect(Number(s.carriedForwardOut)).toBeGreaterThan(0);
    }
  });

  it("INT-272: AC-13 VAT overrides settings vatRate (BR-07)", async () => {
    const settings = {
      async get() {
        return {
          currency: "EUR" as const,
          threshold: 0.01,
          vatRate: 0,
          billingMode: "virtual" as const,
        };
      },
    };
    const referenceData = {
      async getVatRate() {
        return 0.2;
      },
      async getRate() {
        return 1;
      },
    };
    service = new SettlementService(
      store,
      new OutboxService(outboxStore),
      trades,
      settings,
      referenceData,
    );
    service.useFixtureScenario("S1");
    const { runId } = await service.startRun({
      communityId,
      type: "periodic",
      period: "2026-11",
    });
    const s = service.getPairSettlement(store.getRun(runId)!.settlementIds[0]!);
    expect(Number(s.energyAmount)).toBeGreaterThan(0);
    expect(Number(s.vat)).toBeCloseTo(Number(s.energyAmount) * 0.2, 2);
  });

  it("INT-272: CHF FX falls back when primary rate date misses (BR-06)", async () => {
    let calls = 0;
    const referenceData = {
      async getVatRate() {
        return 0;
      },
      async getRate(_currency: "EUR" | "CHF", date: string) {
        calls += 1;
        if (date === "2026-11-28") {
          throw new Error("missing");
        }
        return 0.94;
      },
    };
    const settings = {
      async get() {
        return {
          currency: "CHF" as const,
          threshold: 0.01,
          vatRate: 0,
          billingMode: "virtual" as const,
        };
      },
    };
    service = new SettlementService(
      store,
      new OutboxService(outboxStore),
      trades,
      settings,
      referenceData,
    );
    service.useFixtureScenario("S1");
    const { runId } = await service.startRun({
      communityId,
      type: "periodic",
      period: "2026-11",
    });
    expect(calls).toBe(2);
    const s = service.getPairSettlement(store.getRun(runId)!.settlementIds[0]!);
    expect(s.currency).toBe("CHF");
    expect(s.rate).toBe("0.94");
  });

  describe("INT-351 — signed carry-forward (BR-04, BR-05, UAT-073)", () => {
    const A = "00000000-0000-4000-8000-00000000000a";
    const B = "00000000-0000-4000-8000-00000000000b";
    const COM = "00000000-0000-4000-8000-0000000000c0";
    let queue: UnbilledTrade[][];
    let source: TradeSourcePort;

    const trade = (tradeId: string, buyer: string, seller: string, eur: number): UnbilledTrade => ({
      tradeId,
      consumerId: buyer,
      producerId: seller,
      communityId: COM,
      kWh: eur * 10,
      pricePerKWhEur: 0.1,
    });

    beforeEach(() => {
      queue = [];
      source = {
        async getUnbilled() {
          return queue.shift() ?? [];
        },
        async markBilled() {},
      };
      service = new SettlementService(store, new OutboxService(outboxStore), source);
    });

    const settlementsOf = async (runId: string) =>
      store.getRun(runId)!.settlementIds.map((id) => service.getPairSettlement(id));

    it("A owes B 3.00 then B owes A 2.00: A still carries 1.00 (no 5.00 invoice)", async () => {
      queue.push([trade("t1", A, B, 3)], [trade("t2", B, A, 2)]);
      const first = await service.startRun({ communityId: COM, type: "periodic", period: "2026-10" });
      expect(await settlementsOf(first.runId)).toEqual([
        expect.objectContaining({ consumerId: A, producerId: B, energyAmount: "0.00", carriedForwardOut: "3.00" }),
      ]);

      const second = await service.startRun({ communityId: COM, type: "periodic", period: "2026-11" });
      expect(await settlementsOf(second.runId)).toEqual([
        expect.objectContaining({
          consumerId: A,
          producerId: B,
          energyAmount: "0.00",
          carriedForwardIn: "3.00",
          carriedForwardOut: "1.00",
        }),
      ]);
    });

    it("UAT-073: 3.00 in January carried, 4.00 in February gives a 7.00 invoice", async () => {
      queue.push([trade("t1", A, B, 3)], [trade("t2", A, B, 4)]);
      await service.startRun({ communityId: COM, type: "periodic", period: "2026-01" });
      const feb = await service.startRun({ communityId: COM, type: "periodic", period: "2026-02" });
      expect(await settlementsOf(feb.runId)).toEqual([
        expect.objectContaining({ consumerId: A, producerId: B, energyAmount: "7.00", carriedForwardIn: "3.00" }),
      ]);
    });

    it("flips the invoice when the reversal exceeds the carried balance", async () => {
      queue.push([trade("t1", A, B, 3)], [trade("t2", B, A, 9)]);
      await service.startRun({ communityId: COM, type: "periodic", period: "2026-10" });
      const second = await service.startRun({ communityId: COM, type: "periodic", period: "2026-11" });
      expect(await settlementsOf(second.runId)).toEqual([
        expect.objectContaining({
          consumerId: B,
          producerId: A,
          energyAmount: "6.00",
          carriedForwardIn: "-3.00",
          carriedForwardOut: "0.00",
        }),
      ]);
      expect(store.getCarry(A, B)).toBe(0);
    });

    it("a final run invoices a carried-only pair without new trades (REQ-056)", async () => {
      queue.push([trade("t1", B, A, 2)]);
      await service.startRun({ communityId: COM, type: "periodic", period: "2026-11" });
      expect(store.getCarry(B, A)).toBe(2);

      const periodic = await service.startRun({ communityId: COM, type: "periodic", period: "2026-12" });
      expect(store.getRun(periodic.runId)!.settlementIds).toHaveLength(0);

      const final = await service.startRun({ communityId: COM, type: "final", period: "2026-12" });
      expect(await settlementsOf(final.runId)).toEqual([
        expect.objectContaining({
          consumerId: B,
          producerId: A,
          tradeIds: [],
          energyAmount: "2.00",
          carriedForwardIn: "2.00",
          carriedForwardOut: "0.00",
        }),
      ]);
      expect(store.listCarries(COM)).toEqual([]);
    });

    it("early settlement of a pair includes its carried balance in either direction", async () => {
      queue.push([trade("t1", B, A, 2)], []);
      await service.startRun({ communityId: COM, type: "periodic", period: "2026-11" });
      const early = await service.startRun({
        communityId: COM,
        type: "early",
        onlyPair: { consumerId: A, producerId: B },
      });
      expect(await settlementsOf(early.runId)).toEqual([
        expect.objectContaining({ consumerId: B, producerId: A, energyAmount: "2.00" }),
      ]);
    });

    it("balances include the carried amount for the paying participant only (REQ-057)", async () => {
      queue.push([trade("t1", A, B, 3)], [trade("t2", A, B, 1)], [trade("t3", A, B, 1)]);
      await service.startRun({ communityId: COM, type: "periodic", period: "2026-10" });
      expect(await service.listBalancesForParticipant(A, COM)).toEqual([
        { counterpartId: B, amount: "4.00", currency: "EUR" },
      ]);
      expect(await service.listBalancesForParticipant(B, COM)).toEqual([]);
    });

    it("a lowered threshold releases a carried-only pair on a periodic run", async () => {
      queue.push([trade("t1", A, B, 3)]);
      await service.startRun({ communityId: COM, type: "periodic", period: "2026-10" });
      service.useFixtureScenario("S1", { threshold: 1 });
      const next = await service.startRun({ communityId: COM, type: "periodic", period: "2026-11" });
      expect(await settlementsOf(next.runId)).toEqual([
        expect.objectContaining({ consumerId: A, producerId: B, energyAmount: "3.00" }),
      ]);
    });
  });

  it("INT-272: rejects live billingMode from settings (BR-12)", async () => {
    service = new SettlementService(
      store,
      new OutboxService(outboxStore),
      trades,
      {
        async get() {
          return {
            currency: "EUR" as const,
            threshold: 5,
            vatRate: 0,
            billingMode: "live" as const,
          };
        },
      },
      null,
    );
    await expect(
      service.startRun({
        communityId,
        type: "periodic",
        period: "2026-11",
      }),
    ).rejects.toThrow(/virtual/);
  });
});
