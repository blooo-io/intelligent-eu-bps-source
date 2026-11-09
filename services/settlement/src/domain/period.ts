/**
 * REQ-006 / BR-06 — billing periods and ECB business days.
 *
 * A period is `YYYY-MM` (monthly) or `YYYY-Qn` (quarterly). Bounds are UTC;
 * `end` is exclusive so a trade delivering up to midnight belongs to the period.
 */
export type Cadence = "monthly" | "quarterly";

export type PeriodBounds = { period: string; start: Date; end: Date };

const MONTHLY = /^(\d{4})-(0[1-9]|1[0-2])$/;
const QUARTERLY = /^(\d{4})-Q([1-4])$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function cadenceOf(billingPeriod: string | undefined): Cadence {
  return billingPeriod === "quarterly" ? "quarterly" : "monthly";
}

export function isPeriod(value: string): boolean {
  return MONTHLY.test(value) || QUARTERLY.test(value);
}

export function parsePeriod(period: string): PeriodBounds {
  const monthly = MONTHLY.exec(period);
  if (monthly) {
    const year = Number(monthly[1]);
    const month = Number(monthly[2]) - 1;
    return {
      period,
      start: new Date(Date.UTC(year, month, 1)),
      end: new Date(Date.UTC(year, month + 1, 1)),
    };
  }
  const quarterly = QUARTERLY.exec(period);
  if (quarterly) {
    const year = Number(quarterly[1]);
    const firstMonth = (Number(quarterly[2]) - 1) * 3;
    return {
      period,
      start: new Date(Date.UTC(year, firstMonth, 1)),
      end: new Date(Date.UTC(year, firstMonth + 3, 1)),
    };
  }
  throw new Error(`invalid billing period ${period}`);
}

/** The period of `cadence` that contains `at`. */
export function periodContaining(at: Date, cadence: Cadence): string {
  const year = at.getUTCFullYear();
  const month = at.getUTCMonth();
  if (cadence === "quarterly") {
    return `${year}-Q${Math.floor(month / 3) + 1}`;
  }
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** The most recent period of `cadence` that ended at or before `at`. */
export function lastClosedPeriod(at: Date, cadence: Cadence): string {
  const current = parsePeriod(periodContaining(at, cadence));
  return periodContaining(new Date(current.start.getTime() - DAY_MS), cadence);
}

/** End-exclusive instant in the `deliveryEnd <= until` form of AC-04. */
export function untilOf(bounds: PeriodBounds): string {
  return bounds.end.toISOString().replace(".000Z", "Z");
}

/** BR-06 — ECB rate date: last TARGET business day of the period. */
export function lastBusinessDayOf(bounds: PeriodBounds): string {
  return businessDayOnOrBefore(new Date(bounds.end.getTime() - DAY_MS));
}

/** BR-06 — ECB rate date for an early settlement: the settlement date, or the business day before. */
export function businessDayOnOrBefore(at: Date): string {
  let day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  while (!isTargetBusinessDay(day)) {
    day = new Date(day.getTime() - DAY_MS);
  }
  return isoDate(day);
}

export function previousBusinessDay(date: string): string {
  return businessDayOnOrBefore(new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS));
}

/** ECB reference rates are published on TARGET2 business days. */
export function isTargetBusinessDay(day: Date): boolean {
  const weekday = day.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  const year = day.getUTCFullYear();
  const md = isoDate(day).slice(5);
  if (md === "01-01" || md === "05-01" || md === "12-25" || md === "12-26") {
    return false;
  }
  const easter = easterSunday(year).getTime();
  const t = day.getTime();
  return t !== easter - 2 * DAY_MS && t !== easter + DAY_MS;
}

/** Gregorian Easter Sunday (anonymous Gregorian algorithm). */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function isoDate(day: Date): string {
  return day.toISOString().slice(0, 10);
}
