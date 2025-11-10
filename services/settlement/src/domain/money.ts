/** BR-08 — exact decimals, round to the cent per line. */

export function roundCent(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatMoney(value: number): string {
  return roundCent(value).toFixed(2);
}

export function formatRate(value: number): string {
  return roundCent(value).toFixed(2);
}

export function formatKWh(value: number): string {
  return roundCent(value).toFixed(2);
}
