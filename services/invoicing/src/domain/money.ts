/**
 * BR-08 — exact cent arithmetic on Money strings.
 * Intermediate work uses integer cents so floating-point noise cannot drift.
 */
export function sumMoney(...values: string[]): string {
  let cents = 0;
  for (const value of values) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      throw new Error(`sumMoney: invalid money "${value}"`);
    }
    cents += Math.round(n * 100);
  }
  // "-0.00" → "0.00" (BR-08 / Task 2.8).
  if (Object.is(cents, -0) || cents === 0) return "0.00";
  return (cents / 100).toFixed(2);
}
