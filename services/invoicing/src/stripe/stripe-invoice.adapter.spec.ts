import { beforeEach, describe, expect, it, vi } from "vitest";

const customersCreate = vi.fn();
const invoiceItemsCreate = vi.fn();
const invoicesCreate = vi.fn();
const finalizeInvoice = vi.fn();
const sendInvoice = vi.fn();

vi.mock("stripe", () => {
  function Stripe() {
    return {
      customers: { create: customersCreate },
      invoiceItems: { create: invoiceItemsCreate },
      invoices: { create: invoicesCreate, finalizeInvoice, sendInvoice },
    };
  }
  return { default: Stripe, Stripe };
});

import { StripeInvoiceAdapter } from "./stripe-invoice.adapter.js";

const settlement = {
  settlementId: "set-1",
  runId: "run-1",
  consumerId: "c-1",
  producerId: "p-1",
  tradeIds: ["t-1"],
  kWh: "10",
  energyAmount: "10.00",
  vat: "2.00",
  currency: "EUR",
  rate: "1.0000",
  rateDate: "2026-11-30",
  communityId: "com-1",
};

describe("StripeInvoiceAdapter (INT-189)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses non-test API keys (BR-12)", () => {
    expect(
      () => new StripeInvoiceAdapter({ secretKey: "sk_live_nope" }),
    ).toThrow(/non-test/);
  });

  it("maps unknown Stripe status to open", async () => {
    invoiceItemsCreate.mockResolvedValue({});
    invoicesCreate.mockResolvedValue({ id: "in_draft2" });
    finalizeInvoice.mockResolvedValue({
      id: "in_final2",
      number: null,
      hosted_invoice_url: null,
      invoice_pdf: null,
      status: "uncollectible",
    });
    const adapter = new StripeInvoiceAdapter({ secretKey: "sk_test_abc" });
    const result = await adapter.createFromSettlement(
      { ...settlement, energyAmount: "0", vat: "0" },
      { stripeAccountId: "acct_prod", stripeCustomerId: "cus_conn", dueDate: "not-a-date" },
    );
    expect(result.status).toBe("open");
    expect(result.legalNumber).toBe("in_final2");
    expect(result.hostedInvoiceUrl).toBe("");
    expect(invoiceItemsCreate).not.toHaveBeenCalled();
  });

  it("UAT-014 REQ-014 bills the connected-account Customer, finalizes without e-mail and returns the PDF (INT-355 / A20 / BR-10)", async () => {
    invoiceItemsCreate.mockResolvedValue({});
    invoicesCreate.mockResolvedValue({ id: "in_draft" });
    finalizeInvoice.mockResolvedValue({
      id: "in_final",
      number: "ACCT-000001",
      hosted_invoice_url: "https://invoice.stripe.com/i/in_final",
      invoice_pdf: "https://pay.stripe.com/invoice/in_final/pdf",
      status: "open",
    });

    const adapter = new StripeInvoiceAdapter({ secretKey: "sk_test_abc" });
    const result = await adapter.createFromSettlement(settlement, {
      stripeAccountId: "acct_prod",
      stripeCustomerId: "cus_conn",
      dueDate: "2099-01-15",
    });

    expect(result).toEqual({
      stripeInvoiceId: "in_final",
      legalNumber: "ACCT-000001",
      hostedInvoiceUrl: "https://pay.stripe.com/invoice/in_final/pdf",
      status: "open",
    });
    // INT-355 — AC-07 owns the Customer; no synthetic per-settlement Customer or e-mail.
    expect(customersCreate).not.toHaveBeenCalled();
    // INT-202 / UAT-050 — draft first, then line items bound to that invoice
    expect(invoicesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_conn",
        collection_method: "charge_automatically",
        auto_advance: false,
        footer: expect.stringMatching(/Self-billing/i),
        description: expect.stringContaining("t-1"),
        pending_invoice_items_behavior: "exclude",
        custom_fields: expect.arrayContaining([
          expect.objectContaining({ name: "ECB rate", value: "1.0000 (2026-11-30)" }),
        ]),
      }),
      { stripeAccount: "acct_prod" },
    );
    expect(invoicesCreate.mock.calls[0][0]).not.toHaveProperty("days_until_due");
    expect(invoiceItemsCreate).toHaveBeenCalledTimes(2);
    expect(invoiceItemsCreate.mock.calls[0][0]).toMatchObject({
      customer: "cus_conn",
      invoice: "in_draft",
      amount: 1000,
      description: "Energy 10 kWh (EUR to EUR at 1.0000 (2026-11-30))",
    });
    expect(invoiceItemsCreate.mock.calls[1][0]).toMatchObject({
      invoice: "in_draft",
      amount: 200,
      description: "VAT",
    });
    expect(finalizeInvoice).toHaveBeenCalledWith(
      "in_draft",
      { auto_advance: false },
      { stripeAccount: "acct_prod" },
    );
    // No payable hosted-invoice e-mail: payment only through AC-07 (no double payment).
    expect(sendInvoice).not.toHaveBeenCalled();
  });

  it("falls back to the hosted invoice URL when Stripe returns no PDF", async () => {
    invoiceItemsCreate.mockResolvedValue({});
    invoicesCreate.mockResolvedValue({ id: "in_draft3" });
    finalizeInvoice.mockResolvedValue({
      id: "in_final3",
      number: "ACCT-000003",
      hosted_invoice_url: "https://invoice.stripe.com/i/in_final3",
      status: "open",
    });
    const adapter = new StripeInvoiceAdapter({ secretKey: "sk_test_abc" });
    const { rateDate: _omitted, ...withoutRateDate } = settlement;
    const result = await adapter.createFromSettlement(withoutRateDate, {
      stripeAccountId: "acct_prod",
      stripeCustomerId: "cus_conn",
      dueDate: "2099-01-15",
    });
    expect(result.hostedInvoiceUrl).toBe("https://invoice.stripe.com/i/in_final3");
    expect(invoicesCreate.mock.calls[0][0].custom_fields).toContainEqual({
      name: "ECB rate",
      value: "1.0000",
    });
  });
});
