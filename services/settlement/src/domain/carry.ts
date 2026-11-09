import { roundCent } from "./money.js";

export type PairBalanceInput = {
  low: string;
  high: string;
  /** Period energy amount in community currency, signed `low` → `high`. */
  energy: number;
  /** Carried-forward balance in community currency, signed `low` → `high`. */
  carriedIn: number;
};

export type PairBalanceDecision = {
  consumerId: string;
  producerId: string;
  /** +1 when the invoice goes `low` → `high`, -1 when it goes `high` → `low`. */
  direction: 1 | -1;
  /** Amount owed by the consumer to the producer (≥ 0), carry included. */
  gross: number;
  /** Amount invoiced now (0 when carried forward). */
  invoiced: number;
  /** Carried-forward balance entering the period, oriented consumer → producer. */
  carriedInOriented: number;
  /** Balance carried to the next period, oriented consumer → producer. */
  carriedOutOriented: number;
  /** Balance carried to the next period, signed `low` → `high` (store form). */
  carriedOutCanonical: number;
};

/**
 * BR-04 / BR-05 / REQ-056 — the carried balance is netted with the period amount
 * before the invoice direction is chosen, so a reversal of the net direction
 * reduces the balance instead of adding to it. Early and final runs ignore the
 * threshold.
 */
export function decidePairBalance(
  input: PairBalanceInput,
  threshold: number,
  forceInvoice: boolean,
): PairBalanceDecision {
  const signed = roundCent(input.energy + input.carriedIn);
  const direction: 1 | -1 = signed < 0 ? -1 : 1;
  const gross = roundCent(Math.abs(signed));
  const carry = !forceInvoice && gross !== 0 && gross < threshold;
  const carriedOutOriented = carry ? gross : 0;
  return {
    consumerId: direction === 1 ? input.low : input.high,
    producerId: direction === 1 ? input.high : input.low,
    direction,
    gross,
    invoiced: carry ? 0 : gross,
    carriedInOriented: roundCent(input.carriedIn * direction),
    carriedOutOriented,
    carriedOutCanonical: roundCent(carriedOutOriented * direction),
  };
}
