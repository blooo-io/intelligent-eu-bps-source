import { describe, expect, it } from "vitest";
import { dec, toFixed } from "./decimal.js";
import { canonicalPair, netCanonicalPairs, netPairs } from "./netting.js";
import type { UnbilledTrade } from "./types.js";

const trade = (
  tradeId: string,
  consumerId: string,
  producerId: string,
  kWh: number,
  pricePerKWhEur: number,
): UnbilledTrade => ({ tradeId, consumerId, producerId, communityId: "com", kWh, pricePerKWhEur });

describe("netPairs (BR-03, BR-04, BR-08)", () => {
  it("computes amount as kWh × price and nets a pair", () => {
    const pairs = netPairs([trade("t1", "c", "p", 10, 0.2), trade("t2", "p", "c", 3, 0.2)]);
    expect(pairs).toHaveLength(1);
    expect(toFixed(pairs[0]!.netKWh, 3)).toBe("7.000");
    expect(toFixed(pairs[0]!.netEur, 2)).toBe("1.40");
    expect(pairs[0]!.consumerId).toBe("c");
    expect(pairs[0]!.producerId).toBe("p");
  });

  it("keeps separate pairs for different producers (S1)", () => {
    const pairs = netPairs([trade("t1", "c", "p1", 10, 0.2), trade("t2", "c", "p2", 12, 0.22)]);
    expect(pairs).toHaveLength(2);
  });

  it("orients the invoice towards the net payer when the seller sorts first", () => {
    const [pair] = netPairs([trade("t1", "b", "a", 10, 0.2)]);
    expect(pair).toMatchObject({ consumerId: "b", producerId: "a", netKWh: dec("10"), netEur: dec("2") });
  });

  it("nets on the canonical order with a signed amount (BR-04)", () => {
    const [bucket] = netCanonicalPairs([trade("t1", "b", "a", 10, 0.2), trade("t2", "a", "b", 4, 0.2)]);
    expect(bucket).toEqual({ low: "a", high: "b", tradeIds: ["t1", "t2"], netKWh: dec("-6"), netEur: dec("-1.2") });
    expect(canonicalPair("b", "a")).toEqual(["a", "b"]);
  });

  it("does not lose small quarter-hour trades (96 × 0.004 kWh at 0.25 €/kWh)", () => {
    const trades = Array.from({ length: 96 }, (_, i) => trade(`t${i}`, "c", "p", 0.004, 0.25));
    const [pair] = netPairs(trades);
    expect(toFixed(pair!.netKWh, 3)).toBe("0.384");
    expect(toFixed(pair!.netEur, 3)).toBe("0.096");
  });

  it("sums binary-unfriendly decimals exactly (0.1 + 0.2)", () => {
    const [pair] = netPairs([trade("t1", "c", "p", 1, 0.1), trade("t2", "c", "p", 1, 0.2)]);
    expect(pair!.netEur).toBe(dec("0.3"));
  });
});
