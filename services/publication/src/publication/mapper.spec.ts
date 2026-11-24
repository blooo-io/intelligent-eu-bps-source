import { describe, expect, it } from "vitest";
import { addMoney, toBillingInvoice, toBillingPayment } from "./mapper.js";

describe("publication mapper (NFR-004, REQ-048, REQ-004)", () => {
  it("addMoney sums integer cents as a number", () => {
    expect(addMoney("0.45", "0.10")).toBe(0.55);
    expect(addMoney("0.05", "0.26")).toBe(0.31);
    expect(addMoney(undefined, null, "")).toBe(0);
    expect(addMoney("2.00")).toBe(2);
  });

  it("emits real gridFeeAmount and taxAmount, issuerStatementId, null paymentIds when empty", () => {
    const payload = toBillingInvoice({
      invoiceId: "i",
      billingId: "b",
      issuerStatementId: "s",
      communityId: "c",
      billingMode: "virtual",
      settlementType: "periodic",
      billingPeriodFrom: "2026-01-01T00:00:00Z",
      billingPeriodUntil: "2026-02-01T00:00:00Z",
      invoiceStatus: "Open",
      invoiceIssueDate: "2026-02-01T00:00:00Z",
      invoiceIssuedTo: "to",
      invoiceIssuedBy: "by",
      selfBilling: true,
      invoiceDueDate: "2026-02-15",
      totalEnergyKWh: 1,
      totalAmount: 2.86,
      outstandingAmount: 2.86,
      energyAmount: 2,
      gridFeeAmount: 0.55,
      gridFeeStatus: "applied",
      taxAmount: 0.31,
      vatRate: 0.1,
      carriedForwardAmount: 0,
      currency: "EUR",
      exchangeRate: {
        sourceCurrency: "EUR",
        rate: 1,
        rateDate: "2026-01-31",
        rateSource: "ECB",
      },
      tradeIds: ["0x1"],
      paymentIds: [],
      createdAt: "2026-02-01T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
    });
    expect(payload.gridFeeAmount).toBe(0.55);
    expect(payload.gridFeeStatus).toBe("applied");
    expect(payload.taxAmount).toBe(0.31);
    expect(payload.totalTaxAmount).toBe(0.31);
    expect(payload.totalAmount).toBe(2.86);
    expect(payload.issuerStatementId).toBe("s");
    expect(payload.paymentIds).toBeNull();
  });

  it("maps payment failureCategory", () => {
    const payload = toBillingPayment({
      paymentId: "p",
      invoiceId: "i",
      communityId: "c",
      billingMode: "virtual",
      payerId: "payer",
      payeeId: "payee",
      paymentDate: "2026-02-01T00:00:00Z",
      paymentAmount: 1,
      currency: "EUR",
      paymentMethod: "card",
      paymentProvider: "stripe",
      paymentStatus: "failed",
      failureCategory: "card_declined",
      createdAt: "2026-02-01T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
    });
    expect(payload.failureCategory).toBe("card_declined");
  });
});
