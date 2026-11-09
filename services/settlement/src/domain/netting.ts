import type { UnbilledTrade } from "./types.js";
import { roundCent } from "./money.js";

export type PairBucket = {
  consumerId: string;
  producerId: string;
  tradeIds: string[];
  /** Net kWh: consumer purchases positive, sales negative (BR-04). */
  netKWh: number;
  /** Net energy amount in EUR before FX (BR-03, BR-04). */
  netEur: number;
};

/**
 * Pair netted on a canonical participant order (`low` < `high`).
 * Positive amounts mean `low` owes `high`; negative amounts mean `high` owes `low`.
 */
export type CanonicalPairBucket = {
  low: string;
  high: string;
  tradeIds: string[];
  netKWh: number;
  netEur: number;
};

/** Canonical order shared by netting and the carry-forward store (BR-04, BR-05). */
export function canonicalPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

/** BR-03 / BR-04 — amount = kWh × price; purchases and sales of a pair are netted. */
export function netCanonicalPairs(trades: UnbilledTrade[]): CanonicalPairBucket[] {
  const buckets = new Map<string, CanonicalPairBucket>();

  for (const t of trades) {
    const [low, high] = canonicalPair(t.consumerId, t.producerId);
    const key = `${low}|${high}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { low, high, tradeIds: [], netKWh: 0, netEur: 0 };
      buckets.set(key, bucket);
    }
    bucket.tradeIds.push(t.tradeId);
    // The buyer owes the seller: positive when `low` buys from `high`.
    const signedKWh = t.consumerId === low ? t.kWh : -t.kWh;
    const signedEur = signedKWh * t.pricePerKWhEur;
    bucket.netKWh = roundCent(bucket.netKWh + signedKWh);
    bucket.netEur = roundCent(bucket.netEur + signedEur);
  }

  return [...buckets.values()];
}

/** BR-04 — invoice direction follows the net amount (consumer owes producer). */
export function netPairs(trades: UnbilledTrade[]): PairBucket[] {
  return netCanonicalPairs(trades).map((b) =>
    b.netEur < 0
      ? {
          consumerId: b.high,
          producerId: b.low,
          tradeIds: b.tradeIds,
          netKWh: roundCent(-b.netKWh),
          netEur: roundCent(-b.netEur),
        }
      : {
          consumerId: b.low,
          producerId: b.high,
          tradeIds: b.tradeIds,
          netKWh: b.netKWh,
          netEur: b.netEur,
        },
  );
}
