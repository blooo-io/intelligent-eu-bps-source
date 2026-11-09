import type { UnbilledTrade } from "./types.js";
import { type Dec, ZERO, dec, mul, neg } from "./decimal.js";

export type PairBucket = {
  consumerId: string;
  producerId: string;
  tradeIds: string[];
  /** Net kWh: consumer purchases positive, sales negative (BR-04). */
  netKWh: Dec;
  /** Net energy amount in EUR before FX, exact (BR-03, BR-04, BR-08). */
  netEur: Dec;
};

/**
 * Pair netted on a canonical participant order (`low` < `high`).
 * Positive amounts mean `low` owes `high`; negative amounts mean `high` owes `low`.
 */
export type CanonicalPairBucket = {
  low: string;
  high: string;
  tradeIds: string[];
  netKWh: Dec;
  netEur: Dec;
};

/** Canonical order shared by netting and the carry-forward store (BR-04, BR-05). */
export function canonicalPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

/**
 * BR-03 / BR-04 / BR-08 — amount = kWh × price, netted per pair in exact
 * decimals; rounding happens once per invoice line, not per trade.
 */
export function netCanonicalPairs(trades: UnbilledTrade[]): CanonicalPairBucket[] {
  const buckets = new Map<string, CanonicalPairBucket>();

  for (const t of trades) {
    const [low, high] = canonicalPair(t.consumerId, t.producerId);
    const key = `${low}|${high}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { low, high, tradeIds: [], netKWh: ZERO, netEur: ZERO };
      buckets.set(key, bucket);
    }
    bucket.tradeIds.push(t.tradeId);
    // The buyer owes the seller: positive when `low` buys from `high`.
    const kWh = dec(t.kWh);
    const signedKWh = t.consumerId === low ? kWh : neg(kWh);
    bucket.netKWh += signedKWh;
    bucket.netEur += mul(signedKWh, dec(t.pricePerKWhEur));
  }

  return [...buckets.values()];
}

/** BR-04 — invoice direction follows the net amount (consumer owes producer). */
export function netPairs(trades: UnbilledTrade[]): PairBucket[] {
  return netCanonicalPairs(trades).map((b) =>
    b.netEur < 0n
      ? {
          consumerId: b.high,
          producerId: b.low,
          tradeIds: b.tradeIds,
          netKWh: neg(b.netKWh),
          netEur: neg(b.netEur),
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
