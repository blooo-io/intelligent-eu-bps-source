/**
 * INT-353 — billing periods and ECB business days (REQ-006, BR-06).
 */
import { describe, expect, it } from "vitest";
import {
  businessDayOnOrBefore,
  cadenceOf,
  isPeriod,
  isTargetBusinessDay,
  lastBusinessDayOf,
  lastClosedPeriod,
  parsePeriod,
  periodContaining,
  previousBusinessDay,
  untilOf,
} from "./period.js";

const at = (iso: string) => new Date(iso);

describe("billing periods (REQ-006)", () => {
  it("reads the community cadence, monthly by default", () => {
    expect(cadenceOf("quarterly")).toBe("quarterly");
    expect(cadenceOf("monthly")).toBe("monthly");
    expect(cadenceOf(undefined)).toBe("monthly");
  });

  it("accepts YYYY-MM and YYYY-Qn only", () => {
    expect(isPeriod("2026-02")).toBe(true);
    expect(isPeriod("2026-Q4")).toBe(true);
    expect(isPeriod("2026-13")).toBe(false);
    expect(isPeriod("2026-Q5")).toBe(false);
    expect(isPeriod("2026-11-28")).toBe(false);
    expect(() => parsePeriod("2026")).toThrow(/invalid billing period/);
  });

  it("bounds a month to its real last day (no day-28 cut-off)", () => {
    expect(untilOf(parsePeriod("2026-02"))).toBe("2026-03-01T00:00:00Z");
    expect(untilOf(parsePeriod("2028-02"))).toBe("2028-03-01T00:00:00Z");
    expect(untilOf(parsePeriod("2026-12"))).toBe("2027-01-01T00:00:00Z");
    expect(parsePeriod("2026-11").start.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("bounds a quarter to three months", () => {
    const q = parsePeriod("2026-Q2");
    expect(q.start.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(untilOf(q)).toBe("2026-07-01T00:00:00Z");
  });

  it("finds the current and the last closed period", () => {
    expect(periodContaining(at("2026-11-09T12:00:00Z"), "monthly")).toBe("2026-11");
    expect(periodContaining(at("2026-11-09T12:00:00Z"), "quarterly")).toBe("2026-Q4");
    expect(lastClosedPeriod(at("2026-12-01T02:00:00Z"), "monthly")).toBe("2026-11");
    expect(lastClosedPeriod(at("2027-01-01T02:00:00Z"), "monthly")).toBe("2026-12");
    expect(lastClosedPeriod(at("2027-01-01T02:00:00Z"), "quarterly")).toBe("2026-Q4");
    expect(lastClosedPeriod(at("2026-05-01T02:00:00Z"), "quarterly")).toBe("2026-Q1");
  });
});

describe("ECB rate date (BR-06)", () => {
  it("uses the last TARGET business day of the period", () => {
    expect(lastBusinessDayOf(parsePeriod("2026-11"))).toBe("2026-11-30");
    expect(lastBusinessDayOf(parsePeriod("2026-02"))).toBe("2026-02-27");
    expect(lastBusinessDayOf(parsePeriod("2026-Q4"))).toBe("2026-12-31");
    // 2027-12-31 is a Friday; 2027-10-31 is a Sunday.
    expect(lastBusinessDayOf(parsePeriod("2027-10"))).toBe("2027-10-29");
  });

  it("skips weekends and TARGET holidays", () => {
    expect(isTargetBusinessDay(at("2026-11-09T00:00:00Z"))).toBe(true);
    expect(isTargetBusinessDay(at("2026-11-08T00:00:00Z"))).toBe(false);
    // New Year, Good Friday, Easter Monday, Labour Day, Christmas, St Stephen.
    for (const holiday of ["2026-01-01", "2026-04-03", "2026-04-06", "2026-05-01", "2026-12-25", "2027-12-27"]) {
      expect(isTargetBusinessDay(at(`${holiday}T00:00:00Z`))).toBe(holiday === "2027-12-27");
    }
    expect(isTargetBusinessDay(at("2028-12-26T00:00:00Z"))).toBe(false);
    expect(businessDayOnOrBefore(at("2026-04-06T15:00:00Z"))).toBe("2026-04-02");
    expect(businessDayOnOrBefore(at("2026-12-27T09:00:00Z"))).toBe("2026-12-24");
    expect(previousBusinessDay("2026-11-30")).toBe("2026-11-27");
  });
});
