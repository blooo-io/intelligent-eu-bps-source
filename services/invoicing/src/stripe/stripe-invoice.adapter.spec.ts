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
  rate: "1.00",
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
    customersCreate.mockResolvedValue({ id: "cus_2" });
    invoiceItemsCreate.mockResolvedValue({});
    invoicesCreate.mockResolvedValue({ id: "in_draft2" });
    finalizeInvoice.mockResolvedValue({
      id: "in_final2",
      number: null,
      hosted_invoice_url: null,
      status: "uncollectible",
    });
    const adapter = new StripeInvoiceAdapter({ secretKey: "sk_test_abc" });
    const result = await adapter.createFromSettlement(
      { ...settlement, energyAmount: "0", vat: "0" },
      { stripeAccountId: "acct_prod", dueDate: "not-a-date" },
    );
    expect(result.status).toBe("open");
    expect(result.legalNumber).toBe("in_final2");
    expect(invoiceItemsCreate).not.toHaveBeenCalled();
  });

  it("creates energy+VAT items and finalizes on Connect account (A20 / BR-10)", async () => {
    customersCreate.mockResolvedValue({ id: "cus_1" });
    invoiceItemsCreate.mockResolvedValue({});
    invoicesCreate.mockResolvedValue({ id: "in_draft" });
    finalizeInvoice.mockResolvedValue({
      id: "in_final",
      number: "ACCT-000001",
      hosted_invoice_url: "https://invoice.stripe.com/i/in_final",
      status: "open",
    });

    const adapter = new StripeInvoiceAdapter({ secretKey: "sk_test_abc" });
    const result = await adapter.createFromSettlement(settlement, {
      stripeAccountId: "acct_prod",
      dueDate: "2099-01-15",
    });

    expect(result).toEqual({
      stripeInvoiceId: "in_final",
      legalNumber: "ACCT-000001",
      hostedInvoiceUrl: "https://invoice.stripe.com/i/in_final",
      status: "open",
    });
    expect(customersCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        // INT-198 / UAT-028 — email required for collection_method=send_invoice
        email: "consumer-c1@example.test",
        metadata: expect.objectContaining({ consumerId: "c-1" }),
      }),
      { stripeAccount: "acct_prod" },
    );
    expect(invoiceItemsCreate).toHaveBeenCalledTimes(2);
    expect(invoiceItemsCreate.mock.calls[0][0]).toMatchObject({
      amount: 1000,
      description: expect.stringContaining("Energy"),
    });
    expect(invoiceItemsCreate.mock.calls[1][0]).toMatchObject({
      amount: 200,
      description: "VAT",
    });
    // INT-201 / UAT-050 / TD-2 — self-billing PDF fields
    expect(invoicesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        footer: expect.stringMatching(/Self-billing/i),
        description: expect.stringContaining("t-1"),
        custom_fields: expect.arrayContaining([
          expect.objectContaining({ name: "FX rate", value: "1.00" }),
        ]),
      }),
      { stripeAccount: "acct_prod" },
    );
    expect(finalizeInvoice).toHaveBeenCalledWith(
      "in_draft",
      {},
      { stripeAccount: "acct_prod" },
    );
    expect(sendInvoice).toHaveBeenCalledWith(
      "in_final",
      {},
      { stripeAccount: "acct_prod" },
    );
  });

  it("still returns the invoice when sendInvoice fails in sandbox (INT-201)", async () => {
    customersCreate.mockResolvedValue({ id: "cus_3" });
    invoiceItemsCreate.mockResolvedValue({});
    invoicesCreate.mockResolvedValue({ id: "in_draft3" });
    finalizeInvoice.mockResolvedValue({
      id: "in_final3",
      number: "ACCT-000003",
      hosted_invoice_url: "https://invoice.stripe.com/i/in_final3",
      status: "open",
    });
    sendInvoice.mockRejectedValueOnce(new Error("email suppressed in sandbox"));

    const adapter = new StripeInvoiceAdapter({ secretKey: "sk_test_abc" });
    const result = await adapter.createFromSettlement(settlement, {
      stripeAccountId: "acct_prod",
      dueDate: "2099-01-15",
    });
    expect(result.stripeInvoiceId).toBe("in_final3");
    expect(result.status).toBe("open");
  });
});
