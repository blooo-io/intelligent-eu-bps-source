/**
 * REQ-004 / BR-05 / BR-08 — tariff charges (grid fee, levy, tax) per pair.
 * Computed in canonical orientation before the threshold decision (R2);
 * oriented onto the invoice only when the pair is invoiced (R3).
 */
import type { CanonicalTrade } from "./trade-lines.js";
import {
  type Dec,
  ZERO,
  add,
  dec,
  mul,
  neg,
  roundCentDec,
} from "./decimal.js";

export type TariffQuote = {
  tariffId: string;
  currency: "EUR" | "CHF";
  gridFeePerKWh: string;
  levyPerKWh: string;
  taxPerKWh: string;
};

export type TariffCharges = {
  gridFee: Dec;
  levy: Dec;
  tax: Dec;
  tariffId: string | null;
};

const ZERO_CHARGES: TariffCharges = {
  gridFee: ZERO,
  levy: ZERO,
  tax: ZERO,
  tariffId: null,
};

/**
 * REQ-004 / BR-08 — Σ signedKWh × perKWh, FX when an EUR tariff feeds a CHF
 * community; each component rounded once to the cent.
 */
export function computeTariffCharges(input: {
  trades: CanonicalTrade[];
  tariff: TariffQuote | null;
  communityCurrency: "EUR" | "CHF";
  fxRate: Dec;
}): TariffCharges {
  const { tariff } = input;
  if (!tariff) return { ...ZERO_CHARGES };

  const fx = tariffFxFactor(
    tariff.currency,
    input.communityCurrency,
    input.fxRate,
  );
  const grid = dec(tariff.gridFeePerKWh);
  const levy = dec(tariff.levyPerKWh);
  const tax = dec(tariff.taxPerKWh);

  let gridSum = ZERO;
  let levySum = ZERO;
  let taxSum = ZERO;
  for (const trade of input.trades) {
    const kWh = mul(trade.signedKWh, fx);
    gridSum = add(gridSum, mul(kWh, grid));
    levySum = add(levySum, mul(kWh, levy));
    taxSum = add(taxSum, mul(kWh, tax));
  }

  return {
    gridFee: roundCentDec(gridSum),
    levy: roundCentDec(levySum),
    tax: roundCentDec(taxSum),
    tariffId: tariff.tariffId,
  };
}

/** Orient canonical charges onto the invoice direction (consumer → producer). */
export function orientCharges(
  c: TariffCharges,
  direction: 1 | -1,
): TariffCharges {
  if (direction === 1) return c;
  return {
    gridFee: neg(c.gridFee),
    levy: neg(c.levy),
    tax: neg(c.tax),
    tariffId: c.tariffId,
  };
}

/** BR-08 — sum of the three charge components. */
export function totalCharges(c: TariffCharges): Dec {
  return add(add(c.gridFee, c.levy), c.tax);
}

function tariffFxFactor(
  tariffCurrency: "EUR" | "CHF",
  communityCurrency: "EUR" | "CHF",
  fxRate: Dec,
): Dec {
  if (tariffCurrency === communityCurrency) return dec(1);
  if (tariffCurrency === "EUR" && communityCurrency === "CHF") return fxRate;
  throw new Error(
    `tariff currency ${tariffCurrency} does not match community ${communityCurrency}`,
  );
}
