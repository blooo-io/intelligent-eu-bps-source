import { describe, expect, it } from "vitest";
import type { BillingRunRecord, PairSettlementRecord } from "../domain/types.js";
import { toPairSettlementBody } from "./pair-settlement.view.js";

const row: PairSettlementRecord = {
  settlementId: "s1",
  runId: "r1",
  consumerId: "c",
  producerId: "p",
  tradeIds: ["t1"],
  lines: [],
  kWh: "5.000",
  energyAmount: "1.00",
  vat: "0.00",
  currency: "CHF",
  rate: "0.941200",
  rateDate: "2026-11-30",
  vatRate: 0.081,
  carriedForwardIn: "0.00",
  carriedForwardOut: "0.00",
  netAmount: 1,
  version: 1,
};

const run: BillingRunRecord = {
  runId: "r1",
  communityId: "community",
  period: "2026-11",
  type: "early",
  version: 1,
  settlementIds: ["s1"],
};

describe("toPairSettlementBody (INT-376, NFR-004)", () => {
  it("exposes the run period, the rate date and the VAT rate used", () => {
    expect(toPairSettlementBody(row, run)).toMatchObject({
      rateDate: "2026-11-30",
      period: "2026-11",
      settlementType: "early",
      periodFrom: "2026-11-01T00:00:00.000Z",
      periodUntil: "2026-12-01T00:00:00.000Z",
      vatRate: 0.081,
    });
  });

  it("defaults a missing VAT rate to 0 for rows stored before INT-376", () => {
    const { vatRate: _vatRate, ...legacy } = row;
    expect(toPairSettlementBody(legacy, run).vatRate).toBe(0);
  });
});
