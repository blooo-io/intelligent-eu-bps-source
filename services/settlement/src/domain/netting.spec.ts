import { describe, expect, it } from "vitest";
import { canonicalPair, netCanonicalPairs, netPairs } from "./netting.js";

describe("netPairs (BR-03, BR-04)", () => {
  it("computes amount as kWh × price and nets a pair", () => {
    const pairs = netPairs([
      {
        tradeId: "t1",
        consumerId: "c",
        producerId: "p",
        communityId: "com",
        kWh: 10,
        pricePerKWhEur: 0.2,
      },
      {
        tradeId: "t2",
        consumerId: "p",
        producerId: "c",
        communityId: "com",
        kWh: 3,
        pricePerKWhEur: 0.2,
      },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].netKWh).toBe(7);
    expect(pairs[0].netEur).toBe(1.4);
    expect(pairs[0].consumerId).toBe("c");
    expect(pairs[0].producerId).toBe("p");
  });

  it("keeps separate pairs for different producers (S1)", () => {
    const pairs = netPairs([
      {
        tradeId: "t1",
        consumerId: "c",
        producerId: "p1",
        communityId: "com",
        kWh: 10,
        pricePerKWhEur: 0.2,
      },
      {
        tradeId: "t2",
        consumerId: "c",
        producerId: "p2",
        communityId: "com",
        kWh: 12,
        pricePerKWhEur: 0.22,
      },
    ]);
    expect(pairs).toHaveLength(2);
  });

  it("orients the invoice towards the net payer when the seller sorts first", () => {
    const pairs = netPairs([
      {
        tradeId: "t1",
        consumerId: "b",
        producerId: "a",
        communityId: "com",
        kWh: 10,
        pricePerKWhEur: 0.2,
      },
    ]);
    expect(pairs[0]).toMatchObject({ consumerId: "b", producerId: "a", netKWh: 10, netEur: 2 });
  });

  it("nets on the canonical order with a signed amount (BR-04)", () => {
    const [bucket] = netCanonicalPairs([
      { tradeId: "t1", consumerId: "b", producerId: "a", communityId: "com", kWh: 10, pricePerKWhEur: 0.2 },
      { tradeId: "t2", consumerId: "a", producerId: "b", communityId: "com", kWh: 4, pricePerKWhEur: 0.2 },
    ]);
    expect(bucket).toEqual({ low: "a", high: "b", tradeIds: ["t1", "t2"], netKWh: -6, netEur: -1.2 });
    expect(canonicalPair("b", "a")).toEqual(["a", "b"]);
  });
});
