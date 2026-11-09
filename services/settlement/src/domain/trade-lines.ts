import { type Dec, ZERO, add, mul, neg, roundCentDec, toFixed } from "./decimal.js";
import { formatMoney } from "./money.js";

/** One trade as netted, signed so a purchase by `low` is positive (BR-04). */
export type CanonicalTrade = {
  tradeId: string;
  deliveryStart?: string;
  deliveryEnd?: string;
  signedKWh: Dec;
  pricePerKWhEur: Dec;
};

/**
 * REQ-007 — a trade line on the invoice. kWh and amount are signed in the
 * invoice direction (the consumer's purchase is positive).
 */
export type InvoiceTradeLine = {
  tradeId: string;
  deliveryStart?: string;
  deliveryEnd?: string;
  kWh: string;
  pricePerKWh: string;
  amount: string;
};

/**
 * REQ-007 / BR-08 — one line per trade in the invoice currency.
 * Each line is rounded to the cent, and the rounding remainder is applied to
 * the last line so the lines plus the carried-in balance equal the invoiced
 * energy amount (itself rounded once).
 */
export function buildInvoiceTradeLines(input: {
  trades: CanonicalTrade[];
  /** +1 when the invoice goes low → high (carry.ts). */
  direction: 1 | -1;
  fxRate: Dec;
  /** Invoiced energy, already rounded to the cent. Zero when the pair is carried. */
  invoiced: Dec;
  carriedInOriented: Dec;
}): InvoiceTradeLine[] {
  if (input.trades.length === 0) return [];
  const orient = (value: Dec) => (input.direction === 1 ? value : neg(value));
  const rounded = input.trades.map((trade) =>
    roundCentDec(mul(mul(orient(trade.signedKWh), trade.pricePerKWhEur), input.fxRate)),
  );
  if (input.invoiced !== ZERO) {
    const sum = rounded.reduce(add, ZERO);
    const delta = input.invoiced - roundCentDec(input.carriedInOriented) - sum;
    rounded[rounded.length - 1] = rounded[rounded.length - 1]! + delta;
  }
  return input.trades.map((trade, index) => ({
    tradeId: trade.tradeId,
    ...(trade.deliveryStart ? { deliveryStart: trade.deliveryStart } : {}),
    ...(trade.deliveryEnd ? { deliveryEnd: trade.deliveryEnd } : {}),
    kWh: toFixed(orient(trade.signedKWh), 3),
    pricePerKWh: formatMoney(trade.pricePerKWhEur),
    amount: formatMoney(rounded[index]!),
  }));
}
