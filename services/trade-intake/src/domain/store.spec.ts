/**
 * TradeStore — BR-01, BR-11 / INT-232.
 */
import { describe, expect, it } from "vitest";
import { createMockSuite } from "@intelligent/mocks";
import { TradeStore } from "./store.js";
import type { StoredTrade } from "./types.js";

const suite = createMockSuite("S1");
const fixture = suite.scenario.trades[0];

function sampleRow(overrides: Partial<StoredTrade> = {}): StoredTrade {
  return {
    tradeId: fixture.tradeId,
    marketId: fixture.marketId,
    buyerActorId: fixture.buyerActorId,
    sellerActorId: fixture.sellerActorId,
    consumerId: "consumer-1",
    producerId: "producer-1",
    communityId: suite.scenario.communityId,
    kWh: "10.00",
    price: "0.20",
    status: "settled",
    deliveryStart: fixture.deliveryStart,
    deliveryEnd: fixture.deliveryEnd,
    billed: false,
    ...overrides,
  };
}

describe("TradeStore", () => {
  it("get returns undefined for unknown tradeId", () => {
    const store = new TradeStore();
    expect(store.get("missing")).toBeUndefined();
  });

  it("listByMarket returns trades for one market", () => {
    const store = new TradeStore();
    store.insertOnce(sampleRow({ tradeId: "t-a", marketId: "m-1" }));
    store.insertOnce(sampleRow({ tradeId: "t-b", marketId: "m-2" }));
    expect(store.listByMarket("m-1")).toHaveLength(1);
    expect(store.listByMarket("m-1")[0].tradeId).toBe("t-a");
  });

  it("markBilled ignores unknown trade ids", () => {
    const store = new TradeStore();
    store.insertOnce(sampleRow());
    expect(() => store.markBilled(["missing", fixture.tradeId])).not.toThrow();
    expect(store.get(fixture.tradeId)!.billed).toBe(true);
  });

  it("resetBilled clears only billed rows", () => {
    const store = new TradeStore();
    store.insertOnce(sampleRow({ tradeId: "open", billed: false }));
    store.insertOnce(sampleRow({ tradeId: "done", billed: true }));
    store.resetBilled();
    expect(store.get("open")!.billed).toBe(false);
    expect(store.get("done")!.billed).toBe(false);
  });
});