import { describe, expect, it } from "vitest";
import { dec } from "./decimal.js";
import { buildInvoiceTradeLines, type CanonicalTrade } from "./trade-lines.js";

const trade = (
  tradeId: string,
  kWh: string,
  price: string,
  deliveryStart: string,
): CanonicalTrade => ({
  tradeId,
  deliveryStart,
  deliveryEnd: "2026-11-01T00:15:00Z",
  signedKWh: dec(kWh),
  pricePerKWhEur: dec(price),
});

/** REQ-007 / BR-08 — per-trade lines sum to the invoiced energy. */
describe("buildInvoiceTradeLines (INT-354 / REQ-007)", () => {
  it("exposes delivery period, kWh, price and amount, summing to the energy", () => {
    const lines = buildInvoiceTradeLines({
      trades: [
        trade("t1", "10", "0.20", "2026-11-01T00:00:00Z"),
        trade("t2", "4", "0.25", "2026-11-01T00:15:00Z"),
      ],
      direction: 1,
      fxRate: dec(1),
      invoiced: dec("3.00"),
      carriedInOriented: dec(0),
    });
    expect(lines).toEqual([
      {
        tradeId: "t1",
        deliveryStart: "2026-11-01T00:00:00Z",
        deliveryEnd: "2026-11-01T00:15:00Z",
        kWh: "10.000",
        pricePerKWh: "0.20",
        amount: "2.00",
      },
      {
        tradeId: "t2",
        deliveryStart: "2026-11-01T00:15:00Z",
        deliveryEnd: "2026-11-01T00:15:00Z",
        kWh: "4.000",
        pricePerKWh: "0.25",
        amount: "1.00",
      },
    ]);
    const sum = lines.reduce((total, line) => total + Number(line.amount), 0);
    expect(sum.toFixed(2)).toBe("3.00");
  });

  it("puts the single rounding remainder on the last line (BR-08)", () => {
    const lines = buildInvoiceTradeLines({
      trades: Array.from({ length: 96 }, (_, i) =>
        trade(`q${i}`, "0.004", "0.25", "2026-11-01T00:00:00Z"),
      ),
      direction: 1,
      fxRate: dec(1),
      invoiced: dec("0.10"),
      carriedInOriented: dec(0),
    });
    expect(lines).toHaveLength(96);
    const sum = lines.reduce((total, line) => total + Number(line.amount), 0);
    expect(sum.toFixed(2)).toBe("0.10");
    expect(lines[0]!.amount).toBe("0.00");
    expect(lines[95]!.amount).toBe("0.10");
  });

  it("orients a purchase by the canonical high party as a positive line (BR-04)", () => {
    // Canonical signed kWh is negative when `high` buys from `low`.
    const [line] = buildInvoiceTradeLines({
      trades: [trade("t1", "-10", "0.20", "2026-11-01T00:00:00Z")],
      direction: -1,
      fxRate: dec(1),
      invoiced: dec("2.00"),
      carriedInOriented: dec(0),
    });
    expect(line).toMatchObject({ kWh: "10.000", amount: "2.00" });
  });
});
