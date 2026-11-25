/**
 * INT-101 / Task 4.8 — async market / data-space ports + five record topics.
 */
import { describe, expect, it } from "vitest";
import { createMockSuite, loadScenario } from "./index.js";
import { createMockDataSpace } from "./dataspace/mock-dataspace.js";
import { createFxFixture } from "./fx/fx-fixture.js";
import { createMockMarket } from "./market/mock-market.js";

describe("mock port edge cases (INT-101)", () => {
  it("REQ-001: queryTrades resolves settled S1 trades", async () => {
    const s = createMockSuite("S1");
    await expect(s.market.queryTrades(s.scenario.period)).resolves.toHaveLength(
      s.scenario.trades.filter((t) => t.status === "settled").length,
    );
  });

  it("market throws when clearing result is missing", async () => {
    const scenario = loadScenario("S12");
    const market = createMockMarket(scenario);
    await expect(market.queryClearingResults("no-such-market")).rejects.toThrow(
      /No clearing result/,
    );
  });

  it("FX falls back when date misses and throws when currency unknown", () => {
    const suite = createMockSuite("S8");
    const fallback = suite.fx.getRate("CHF", "2099-01-01");
    expect(fallback.rate).toBeGreaterThan(0);
    expect(fallback.rateDate).toBe("2099-01-01");

    const empty = loadScenario("S8");
    empty.fxRates = [];
    const fx = createFxFixture(empty);
    expect(() => fx.getRate("USD", "2026-11-30")).toThrow(/No FX fixture/);
  });

  it("REQ-048: mock data space accepts billingPayout example and rejects one with iban", async () => {
    const ds = createMockDataSpace();
    const good = {
      payoutId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      actorId: "11111111-2222-4333-8444-555555555555",
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
      billingMode: "virtual",
      amount: 42.5,
      currency: "EUR",
      payoutStatus: "paid",
      trigger: "manual",
      createdAt: "2026-12-03T10:14:30Z",
      updatedAt: "2026-12-03T10:15:00Z",
    };
    await expect(ds.publish("billingPayout", good)).resolves.toEqual({ ok: true });

    const withIban = { ...good, iban: "DE89370400440532013000" };
    const rejected = await ds.publish("billingPayout", withIban);
    expect(rejected.ok).toBe(false);
  });

  it("data-space rejects unknown topic shape and supports purgeCache", async () => {
    const ds = createMockDataSpace();
    // @ts-expect-error intentional unknown topic for runtime guard
    const badTopic = await ds.publish("notATopic", {});
    expect(badTopic.ok).toBe(false);

    const payment = {
      paymentId: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
      invoiceId: "3f1c2a9e-8b7d-4c21-9a0e-5d6f7a8b9c01",
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
      billingMode: "virtual",
      payerId: "11111111-2222-4333-8444-555555555555",
      payeeId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
      paymentDate: "2026-12-03T10:14:52+01:00",
      paymentAmount: 10.2,
      currency: "CHF",
      paymentMethod: "card",
      paymentProvider: "stripe",
      paymentStatus: "succeeded",
      failureCategory: null,
      createdAt: "2026-12-03T10:14:30+01:00",
      updatedAt: "2026-12-03T10:15:00+01:00",
    };
    expect((await ds.publish("billingPayment", payment)).ok).toBe(true);
    expect(ds.recorded()).toHaveLength(1);
    const removed = await ds.purgeCache("2026-12-04T00:00:00Z");
    expect(removed).toBe(1);
    expect(ds.recorded()).toHaveLength(0);
  });

  it("loadScenario rejects unknown ids", () => {
    // @ts-expect-error intentional
    expect(() => loadScenario("S99")).toThrow(/Unknown scenario/);
  });
});
