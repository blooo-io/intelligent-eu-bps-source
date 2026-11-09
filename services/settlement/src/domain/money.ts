import { type Dec, abs, roundCentDec, toFixed } from "./decimal.js";

/** BR-08 — amounts are rounded once, to the cent, per invoice line. */
export function formatMoney(value: Dec): string {
  return toFixed(roundCentDec(value), 2);
}

/** BR-06 — the ECB rate is shown with at least 4 and at most 6 decimals. */
export function formatRate(value: Dec): string {
  return toFixed(value, 6).replace(/(\.\d{4}\d*?)0+$/, "$1");
}

/** Energy quantity shown to the watt-hour. */
export function formatKWh(value: Dec): string {
  return toFixed(abs(value), 3);
}
