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
 * BR-03 / BR-04 — amount = kWh × price; purchases and sales of a pair are netted.
 * Pair key is unordered participant pair oriented so the net payer is consumer.
 */
export function netPairs(trades: UnbilledTrade[]): PairBucket[] {
  const buckets = new Map<string, PairBucket & { a: string; b: string }>();

  for (const t of trades) {
    const [low, high] =
      t.consumerId < t.producerId
        ? [t.consumerId, t.producerId]
        : [t.producerId, t.consumerId];
    const key = `${low}|${high}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        a: low,
        b: high,
        consumerId: low,
        producerId: high,
        tradeIds: [],
        netKWh: 0,
        netEur: 0,
      };
      buckets.set(key, bucket);
    }
    bucket.tradeIds.push(t.tradeId);
    // Signed contribution from consumer←producer purchase direction.
    const signedKWh =
      t.consumerId === bucket.a && t.producerId === bucket.b
        ? t.kWh
        : -t.kWh;
    const signedEur = signedKWh * t.pricePerKWhEur;
    bucket.netKWh = roundCent(bucket.netKWh + signedKWh);
    bucket.netEur = roundCent(bucket.netEur + signedEur);
  }

  const result: PairBucket[] = [];
  for (const bucket of buckets.values()) {
    // Orient so consumer owes producer when netEur > 0 (BR-04 invoice direction).
    if (bucket.netEur < 0) {
      result.push({
        consumerId: bucket.b,
        producerId: bucket.a,
        tradeIds: bucket.tradeIds,
        netKWh: roundCent(-bucket.netKWh),
        netEur: roundCent(-bucket.netEur),
      });
    } else {
      result.push({
        consumerId: bucket.a,
        producerId: bucket.b,
        tradeIds: bucket.tradeIds,
        netKWh: bucket.netKWh,
        netEur: bucket.netEur,
      });
    }
  }
  return result;
}
