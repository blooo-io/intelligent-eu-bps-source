import type { Tariff } from "./tariff.port.js";

/** Compare calendar dates (YYYY-MM-DD) ignoring time-of-day when present. */
export function toDateKey(isoOrDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) return isoOrDate;
  const t = Date.parse(isoOrDate);
  if (Number.isNaN(t)) return isoOrDate.slice(0, 10);
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * REQ-004 — validFrom inclusive, validUntil exclusive (null = open-ended).
 */
export function tariffCovers(
  tariff: Pick<Tariff, "validFrom" | "validUntil">,
  at: string,
): boolean {
  const day = toDateKey(at);
  const from = toDateKey(tariff.validFrom);
  if (day < from) return false;
  if (tariff.validUntil == null) return true;
  const until = toDateKey(tariff.validUntil);
  return day < until;
}

/**
 * Format a numeric EWDS unit price as a UnitPrice string (4–6 decimals).
 * 0.045 → "0.0450".
 */
export function formatUnitPrice(value: number): string {
  const fixed = value.toFixed(6);
  const [intPart, frac = ""] = fixed.split(".");
  const trimmed = frac.replace(/0+$/, "");
  const decimals = (trimmed.length < 4 ? trimmed.padEnd(4, "0") : trimmed).slice(
    0,
    6,
  );
  return `${intPart}.${decimals}`;
}
