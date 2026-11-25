import { describe, expect, it } from "vitest";
import { dec } from "./decimal.js";
import {
  computeTariffCharges,
  orientCharges,
  totalCharges,
  type TariffQuote,
} from "./charges.js";
import type { CanonicalTrade } from "./trade-lines.js";

/** UAT-004 fixture tariff (AC-13 mock). */
const UAT004: TariffQuote = {
  tariffId: "tariff-uat004-2026",
  currency: "EUR",
  gridFeePerKWh: "0.0450",
  levyPerKWh: "0.0100",
  taxPerKWh: "0.0050",
};

function trade(signedKWh: string, price = "0.20"): CanonicalTrade {
  return {
    tradeId: `t-${signedKWh}`,
    signedKWh: dec(signedKWh),
    pricePerKWhEur: dec(price),
  };
}

describe("computeTariffCharges (REQ-004)", () => {
  it("REQ-004 computes grid fee, levy and tax per kWh, rounded once", () => {
    const charges = computeTariffCharges({
      trades: [trade("10.000"), trade("-2.000")],
      tariff: UAT004,
      communityCurrency: "EUR",
      fxRate: dec(1),
    });
    // Net 8 kWh × {0.045, 0.010, 0.005}.
    expect(charges.gridFee).toBe(dec("0.36"));
    expect(charges.levy).toBe(dec("0.08"));
    expect(charges.tax).toBe(dec("0.04"));
    expect(charges.tariffId).toBe("tariff-uat004-2026");
    expect(totalCharges(charges)).toBe(dec("0.48"));
  });

  it("REQ-004 converts an EUR tariff for a CHF community", () => {
    const charges = computeTariffCharges({
      trades: [trade("10.000")],
      tariff: UAT004,
      communityCurrency: "CHF",
      fxRate: dec("0.9412"),
    });
    // 0.045 × 10 × 0.9412 = 0.42354 → 0.42
    expect(charges.gridFee).toBe(dec("0.42"));
  });

  it("REQ-004 returns zero charges and tariffId null without tariff", () => {
    const charges = computeTariffCharges({
      trades: [trade("10.000")],
      tariff: null,
      communityCurrency: "EUR",
      fxRate: dec(1),
    });
    expect(charges).toEqual({
      gridFee: 0n,
      levy: 0n,
      tax: 0n,
      tariffId: null,
    });
  });

  it("refuses a CHF tariff for an EUR community", () => {
    expect(() =>
      computeTariffCharges({
        trades: [trade("1.000")],
        tariff: { ...UAT004, currency: "CHF" },
        communityCurrency: "EUR",
        fxRate: dec(1),
      }),
    ).toThrow("tariff currency CHF does not match community EUR");
  });

  it("orientCharges flips the sign for a reverse invoice", () => {
    const canonical = computeTariffCharges({
      trades: [trade("10.000")],
      tariff: UAT004,
      communityCurrency: "EUR",
      fxRate: dec(1),
    });
    const oriented = orientCharges(canonical, -1);
    expect(oriented.gridFee).toBe(dec("-0.45"));
    expect(oriented.levy).toBe(dec("-0.10"));
    expect(oriented.tax).toBe(dec("-0.05"));
    expect(orientCharges(canonical, 1)).toBe(canonical);
  });
});
