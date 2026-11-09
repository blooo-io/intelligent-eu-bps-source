/**
 * BR-08 — exact decimal arithmetic on scaled integers (12 fractional digits).
 * Trade quantities and prices arrive as JSON numbers; they are parsed from
 * their shortest decimal representation, never accumulated as binary floats.
 */
export type Dec = bigint;

const DIGITS = 12;
const SCALE = 10n ** BigInt(DIGITS);

export const ZERO: Dec = 0n;

export function dec(value: number | string): Dec {
  const text = typeof value === "number" ? numberToPlain(value) : value.trim();
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) {
    throw new Error(`invalid decimal: ${String(value)}`);
  }
  const [, sign, intPart, fracPart = ""] = match;
  const digits = Math.max(DIGITS, fracPart.length);
  const raw =
    BigInt(intPart || "0") * 10n ** BigInt(digits) + BigInt(fracPart.padEnd(digits, "0") || "0");
  const units = divRound(raw, 10n ** BigInt(digits - DIGITS));
  return sign === "-" ? -units : units;
}

function numberToPlain(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`invalid decimal: ${value}`);
  }
  const text = String(value);
  return /e/i.test(text) ? value.toFixed(DIGITS + 1) : text;
}

export function add(a: Dec, b: Dec): Dec {
  return a + b;
}

export function neg(a: Dec): Dec {
  return -a;
}

export function abs(a: Dec): Dec {
  return a < 0n ? -a : a;
}

/** Product rounded half away from zero to 12 fractional digits. */
export function mul(a: Dec, b: Dec): Dec {
  return divRound(a * b, SCALE);
}

/** Rounds half away from zero to `digits` fractional digits (still scaled). */
export function roundTo(a: Dec, digits: number): Dec {
  const step = 10n ** BigInt(DIGITS - digits);
  return divRound(a, step) * step;
}

export function roundCentDec(a: Dec): Dec {
  return roundTo(a, 2);
}

export function toFixed(a: Dec, digits: number): string {
  const rounded = roundTo(a, digits);
  const negative = rounded < 0n;
  const units = negative ? -rounded : rounded;
  const intPart = units / SCALE;
  const frac = (units % SCALE).toString().padStart(DIGITS, "0").slice(0, digits);
  const body = digits > 0 ? `${intPart}.${frac}` : `${intPart}`;
  return negative && units !== 0n ? `-${body}` : body;
}

export function toNumber(a: Dec): number {
  return Number(toFixed(a, DIGITS));
}

export function compareAbs(a: Dec, b: Dec): number {
  const x = abs(a);
  const y = abs(b);
  return x === y ? 0 : x < y ? -1 : 1;
}

function divRound(n: bigint, d: bigint): bigint {
  const q = n / d;
  const r = n % d;
  if (r === 0n) return q;
  const twice = (r < 0n ? -r : r) * 2n;
  if (twice >= d) return n < 0n ? q - 1n : q + 1n;
  return q;
}
