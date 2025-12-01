/** Add Money strings (BR-08, two decimal places). */
export function addMoney(a: string, b: string): string {
  const sum = Math.round((Number(a) + Number(b)) * 100) / 100;
  return sum.toFixed(2);
}

export function sumMoney(values: string[]): string {
  return values.reduce((acc, v) => addMoney(acc, v), "0.00");
}
