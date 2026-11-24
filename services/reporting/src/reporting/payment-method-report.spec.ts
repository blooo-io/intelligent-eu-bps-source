/**
 * REQ-046 / UAT-057 / TE-2 / ER1.4 — per-payment-method KPI aggregation.
 */
import { describe, expect, it } from "vitest";
import type { PaymentProjection } from "../domain/types.js";
import {
  buildPaymentMethodReport,
  median,
} from "./payment-method-report.js";

function p(
  method: string,
  status: string,
  processingTimeMs?: number,
  feeAmount?: string,
  extras: Partial<PaymentProjection> = {},
): PaymentProjection {
  return {
    paymentId: extras.paymentId ?? `pay-${method}-${status}-${processingTimeMs ?? "x"}-${feeAmount ?? "nofee"}`,
    invoiceId: extras.invoiceId ?? "inv-1",
    communityId: extras.communityId ?? "c0ffee00-1234-4abc-8def-0123456789ab",
    amount: extras.amount ?? "10.00",
    currency: extras.currency ?? "EUR",
    status,
    method,
    ...(processingTimeMs !== undefined ? { processingTimeMs } : {}),
    ...(feeAmount !== undefined ? { feeAmount, feeCurrency: extras.feeCurrency ?? "EUR" } : {}),
    ...extras,
  };
}

describe("median (TE-2)", () => {
  it("TE-2 median: odd and even counts", () => {
    expect(median([1000, 3000, 2000])).toBe(2000);
    expect(median([1000, 2000, 3000, 4000])).toBe(2500);
    expect(median([])).toBeNull();
  });
});

describe("buildPaymentMethodReport (ER1.4 / UAT-057)", () => {
  it("UAT-057 ER1.4 card vs SEPA: count, success rate, median time, total and average fee", () => {
    const rows = buildPaymentMethodReport([
      p("card", "succeeded", 1000, "1.75"),
      p("card", "succeeded", 3000, "0.40"),
      p("card", "failed"),
      p("sepa_debit", "succeeded", 259_200_000, "0.35"),
      p("sepa_debit", "pending"),
    ]);
    expect(rows).toEqual([
      {
        method: "card",
        feeCurrency: "EUR",
        count: 3,
        succeededCount: 2,
        failedCount: 1,
        pendingCount: 0,
        successRate: 0.6667,
        medianProcessingTimeMs: 2000,
        totalFee: "2.15",
        averageFee: "1.08",
        feeMissingCount: 0,
      },
      {
        method: "sepa_debit",
        feeCurrency: "EUR",
        count: 2,
        succeededCount: 1,
        failedCount: 0,
        pendingCount: 1,
        successRate: 1,
        medianProcessingTimeMs: 259_200_000,
        totalFee: "0.35",
        averageFee: "0.35",
        feeMissingCount: 0,
      },
    ]);
  });

  it("REQ-046 succeeded payment without fee counts in feeMissingCount, not in averageFee", () => {
    const rows = buildPaymentMethodReport([
      p("card", "succeeded", 1000, "1.00"),
      p("card", "succeeded", 2000), // no fee
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      method: "card",
      succeededCount: 2,
      feeMissingCount: 1,
      totalFee: "1.00",
      averageFee: "1.00",
    });
  });

  it("ER1.4 rows split by feeCurrency", () => {
    const rows = buildPaymentMethodReport([
      p("card", "succeeded", 1000, "0.50", { feeCurrency: "CHF", currency: "CHF" }),
      p("card", "succeeded", 2000, "0.40", { feeCurrency: "EUR", currency: "EUR" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.feeCurrency).sort()).toEqual(["CHF", "EUR"]);
    expect(rows.every((r) => r.method === "card" && r.count === 1)).toBe(true);
  });

  it("successRate is null when there are only pending payments", () => {
    const rows = buildPaymentMethodReport([p("card", "pending")]);
    expect(rows[0]?.successRate).toBeNull();
    expect(rows[0]?.medianProcessingTimeMs).toBeNull();
    expect(rows[0]?.averageFee).toBeNull();
  });

  it("groups missing method as unknown and uses payment currency for feeCurrency", () => {
    const rows = buildPaymentMethodReport([
      {
        paymentId: "pay-unk",
        invoiceId: "inv-1",
        communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
        amount: "1.00",
        currency: "CHF",
        status: "succeeded",
        feeAmount: "0.10",
      },
    ]);
    expect(rows).toEqual([
      expect.objectContaining({
        method: "unknown",
        feeCurrency: "CHF",
        succeededCount: 1,
        totalFee: "0.10",
        averageFee: "0.10",
        feeMissingCount: 0,
      }),
    ]);
  });
});
