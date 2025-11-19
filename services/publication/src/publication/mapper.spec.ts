import { describe, expect, it } from "vitest";
import { toBillingInvoice, toBillingPayment } from "./mapper.js";

describe("publication mapper (NFR-004, REQ-048)", () => {
  it("forces gridFeeAmount to 0 and null paymentIds when empty", () => {
    const payload = toBillingInvoice({
      invoiceId: "i",
      billingId: "b",
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
      totalAmount: 1,
      outstandingAmount: 1,
      energyAmount: 1,
      taxAmount: 0,
      vatRate: 0,
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
    expect(payload.gridFeeAmount).toBe(0);
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
