/**
 * INT-101 / AC-15 — scenario registry and port behaviour (REQ-001, REQ-002, REQ-048).
 * Covers architecture 03 §8 scenarios S1–S13.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeEach } from "vitest";
import {
  listScenarioIds,
  loadScenario,
  createMockSuite,
  type ScenarioId,
} from "./index.js";

const ALL: ScenarioId[] = [
  "S1",
  "S2",
  "S3",
  "S4",
  "S5",
  "S6",
  "S7",
  "S8",
  "S9",
  "S10",
  "S11",
  "S12",
  "S13",
];

describe("scenario registry (INT-101 / 03 §8)", () => {
  it("lists every V1 scenario S1–S13", () => {
    expect(listScenarioIds()).toEqual(ALL);
  });

  it("loads each scenario with id, validates refs and non-empty description", () => {
    for (const id of ALL) {
      const s = loadScenario(id);
      expect(s.id).toBe(id);
      expect(s.description.length).toBeGreaterThan(0);
      expect(s.validates.length).toBeGreaterThan(0);
      expect(s.communityId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    }
  });
});

describe("market / FX / data-space ports against scenarios", () => {
  beforeEach(() => {
    // each test creates its own suite
  });

  it("S1: consumer buys from 2 producers → market returns trades with 2 sellers (REQ-054)", () => {
    const suite = createMockSuite("S1");
    const trades = suite.market.queryTrades({
      from: "2026-11-01T00:00:00Z",
      until: "2026-11-02T00:00:00Z",
    });
    expect(trades.every((t) => t.status === "settled")).toBe(true);
    const sellers = new Set(trades.map((t) => t.sellerActorId));
    const buyers = new Set(trades.map((t) => t.buyerActorId));
    expect(sellers.size).toBe(2);
    expect(buyers.size).toBe(1);
  });

  it("S2: prosumers trade both ways → both directions present (REQ-055)", () => {
    const suite = createMockSuite("S2");
    const trades = suite.market.queryTrades({
      from: "2026-11-01T00:00:00Z",
      until: "2026-11-02T00:00:00Z",
    });
    const a = trades[0]!.buyerActorId;
    const b = trades[0]!.sellerActorId;
    expect(trades.some((t) => t.buyerActorId === a && t.sellerActorId === b)).toBe(
      true,
    );
    expect(trades.some((t) => t.buyerActorId === b && t.sellerActorId === a)).toBe(
      true,
    );
  });

  it("S3: pair below threshold carries energyAmount under 5 (REQ-056)", () => {
    const suite = createMockSuite("S3");
    const trades = suite.market.queryTrades({
      from: "2026-11-01T00:00:00Z",
      until: "2026-11-02T00:00:00Z",
    });
    const total = trades.reduce(
      (sum, t) => sum + t.energyKWh * t.pricePerKWhEur,
      0,
    );
    expect(total).toBeLessThan(5);
  });

  it("S4: unknown party flag on at least one trade (REQ-058)", () => {
    const suite = createMockSuite("S4");
    const trades = suite.market.queryTrades({
      from: "2026-11-01T00:00:00Z",
      until: "2026-11-02T00:00:00Z",
    });
    expect(trades.some((t) => t.unknownParty === true)).toBe(true);
  });

  it("S5: clearing result disagrees with trade count (REQ-041)", () => {
    const suite = createMockSuite("S5");
    const markets = suite.market.queryMarkets({
      from: "2026-11-01T00:00:00Z",
      until: "2026-11-02T00:00:00Z",
    });
    expect(markets.length).toBeGreaterThan(0);
    const clearing = suite.market.queryClearingResults(markets[0]!.marketId);
    const trades = suite.market.queryTrades({
      from: "2026-11-01T00:00:00Z",
      until: "2026-11-02T00:00:00Z",
    });
    expect(clearing.numTrades).not.toBe(trades.length);
  });

  it("S6: late trade has lateArrival flag (REQ-001)", () => {
    const suite = createMockSuite("S6");
    const trades = suite.market.queryTrades({
      from: "2026-11-01T00:00:00Z",
      until: "2026-11-02T00:00:00Z",
    });
    expect(trades.some((t) => t.lateArrival === true)).toBe(true);
  });

  it("S7: duplicate tradeId appears twice in raw feed; unique by id is one (REQ-001)", () => {
    const suite = createMockSuite("S7");
    const trades = suite.market.queryTrades({
      from: "2026-11-01T00:00:00Z",
      until: "2026-11-02T00:00:00Z",
    });
    const ids = trades.map((t) => t.tradeId);
    expect(ids.length).toBeGreaterThan(new Set(ids).size);
  });

  it("S8: FX fixture returns ECB EUR→CHF rate (REQ-002)", () => {
    const suite = createMockSuite("S8");
    const rate = suite.fx.getRate("CHF", "2026-11-30");
    expect(rate.source).toBe("ECB");
    expect(rate.rate).toBeGreaterThan(0);
    expect(rate.sourceCurrency).toBe("EUR");
    expect(rate.targetCurrency).toBe("CHF");
  });

  it("S9: early settlement metadata is present (REQ-057)", () => {
    const s = loadScenario("S9");
    expect(s.settlementType).toBe("early");
  });

  it("S10: documents Stripe test failure cards (REQ-016)", () => {
    const s = loadScenario("S10");
    expect(s.stripeTestCards?.length).toBeGreaterThan(0);
    expect(s.stripeTestCards?.some((c) => c.outcome === "declined")).toBe(true);
  });

  it("S11: producer without KYC flagged (REQ-045)", () => {
    const s = loadScenario("S11");
    expect(s.producersWithoutKyc?.length).toBeGreaterThan(0);
  });

  it("S12: erasure request payload present (REQ-013)", () => {
    const s = loadScenario("S12");
    expect(s.erasureRequest?.participantId).toBeTruthy();
  });

  it("S13: data-space mock accepts billingInvoice example and rejects bad grid fee (REQ-048)", async () => {
    const suite = createMockSuite("S13");
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../docs/architecture/ewds-topics",
    );
    const good = JSON.parse(
      await readFile(path.join(root, "billingInvoice.example.json"), "utf8"),
    );
    const published = suite.dataSpace.publish("billingInvoice", good);
    expect(published.ok).toBe(true);

    const bad = { ...good, gridFeeAmount: 1.5 };
    const rejected = suite.dataSpace.publish("billingInvoice", bad);
    expect(rejected.ok).toBe(false);
    expect(suite.dataSpace.recorded().length).toBe(1);
  });
});
