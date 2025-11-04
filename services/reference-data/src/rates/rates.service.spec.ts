/**
 * INT-102 / REQ-002 — GetRate and FetchRates against the AC-15 ECB fixture.
 */
import { describe, expect, it } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { RatesService } from "./rates.service.js";

describe("RatesService (INT-102 / REQ-002)", () => {
  it("returns identity rate for EUR", () => {
    const svc = new RatesService();
    expect(svc.getRate("EUR", "2026-11-30")).toEqual({
      currency: "EUR",
      date: "2026-11-30",
      rate: "1.00",
      source: "identity",
    });
  });

  it("returns ECB CHF fixture rate with two decimal places (BR-08)", () => {
    const svc = new RatesService();
    const quote = svc.getRate("CHF", "2026-11-30");
    expect(quote.currency).toBe("CHF");
    expect(quote.source).toBe("ECB");
    expect(quote.rate).toMatch(/^\d+\.\d{2}$/);
    expect(Number(quote.rate)).toBeCloseTo(0.94, 2);
  });

  it("throws NotFound for unknown currency codes", () => {
    const svc = new RatesService();
    expect(() => svc.getRate("usd", "2026-11-30")).toThrow(NotFoundException);
    expect(() => svc.getRate("JPY", "2026-11-30")).toThrow(NotFoundException);
  });

  it("fetchRates accepts a date (AC-14 hook)", () => {
    const svc = new RatesService();
    expect(svc.fetchRates("2026-11-28")).toEqual({
      date: "2026-11-28",
      accepted: true,
    });
  });

  it("useFxPort swaps the adapter for tests", () => {
    const svc = new RatesService();
    svc.useFxPort({
      getRate: () => ({
        sourceCurrency: "EUR",
        targetCurrency: "CHF",
        rate: 0.99,
        rateDate: "2026-01-01",
        source: "ECB",
      }),
    });
    expect(svc.getRate("CHF", "2026-01-01").rate).toBe("0.99");
  });
});
