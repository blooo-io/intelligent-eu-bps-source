/** BR-08 — amounts/rates on the wire use two decimal places. */
export function formatMoney(value: number): string {
  return value.toFixed(2);
}

export function formatKWh(value: number): string {
  // Energy may need more precision; OpenAPI kWh is string — keep two decimals for V1.
  return value.toFixed(2);
}
