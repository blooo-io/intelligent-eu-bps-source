import { type Dec, ZERO, abs, compareAbs, neg, roundCentDec } from "./decimal.js";

export type PairBalanceInput = {
  low: string;
  high: string;
  /** Exact period energy amount in community currency, signed `low` → `high`. */
  energy: Dec;
  /** Carried-forward balance in community currency, signed `low` → `high`. */
  carriedIn: Dec;
};

export type PairBalanceDecision = {
  consumerId: string;
  producerId: string;
  /** +1 when the invoice goes `low` → `high`, -1 when it goes `high` → `low`. */
  direction: 1 | -1;
  /** Amount owed by the consumer to the producer (≥ 0), carry included, to the cent. */
  gross: Dec;
  /** Amount invoiced now (0 when carried forward). */
  invoiced: Dec;
  /** Carried-forward balance entering the period, oriented consumer → producer. */
  carriedInOriented: Dec;
  /** Balance carried to the next period, oriented consumer → producer. */
  carriedOutOriented: Dec;
  /** Balance carried to the next period, signed `low` → `high` (store form). */
  carriedOutCanonical: Dec;
};

/**
 * BR-04 / BR-05 / REQ-056 — the carried balance is netted with the period amount
 * before the invoice direction is chosen, so a reversal of the net direction
 * reduces the balance instead of adding to it. Early and final runs ignore the
 * threshold. BR-08 — the energy line is rounded to the cent once, here.
 */
export function decidePairBalance(
  input: PairBalanceInput,
  threshold: Dec,
  forceInvoice: boolean,
): PairBalanceDecision {
  const signed = roundCentDec(input.energy + input.carriedIn);
  const direction: 1 | -1 = signed < 0n ? -1 : 1;
  const gross = abs(signed);
  const carry = !forceInvoice && gross !== ZERO && compareAbs(gross, threshold) < 0;
  const carriedOutOriented = carry ? gross : ZERO;
  const orient = (v: Dec) => (direction === 1 ? v : neg(v));
  return {
    consumerId: direction === 1 ? input.low : input.high,
    producerId: direction === 1 ? input.high : input.low,
    direction,
    gross,
    invoiced: carry ? ZERO : gross,
    carriedInOriented: orient(input.carriedIn),
    carriedOutOriented,
    carriedOutCanonical: orient(carriedOutOriented),
  };
}
