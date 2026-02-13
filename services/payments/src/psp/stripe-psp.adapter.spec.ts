import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  accountsCreate,
  accountLinksCreate,
  paymentMethodsRetrieve,
  paymentIntentsCreate,
  refundsCreate,
  constructEvent,
  StripeCardError,
} = vi.hoisted(() => {
  class StripeCardError extends Error {
    decline_code?: string;
    code?: string;
    constructor(message: string, decline_code?: string) {
      super(message);
      this.decline_code = decline_code;
      this.code = "card_declined";
    }
  }
  return {
    accountsCreate: vi.fn(),
    accountLinksCreate: vi.fn(),
    paymentMethodsRetrieve: vi.fn(),
    paymentIntentsCreate: vi.fn(),
    refundsCreate: vi.fn(),
    constructEvent: vi.fn(),
    StripeCardError,
  };
});

vi.mock("stripe", () => {
  function Stripe() {
    return {
      accounts: { create: accountsCreate },
      accountLinks: { create: accountLinksCreate },
      paymentMethods: { retrieve: paymentMethodsRetrieve },
      paymentIntents: { create: paymentIntentsCreate },
      refunds: { create: refundsCreate },
      webhooks: { constructEvent },
    };
  }
  Stripe.errors = { StripeCardError };
  return { default: Stripe, Stripe };
});

import { StripePspAdapter } from "./stripe-psp.adapter.js";

describe("StripePspAdapter (INT-189)", () => {
  const creds = {
    secretKey: "sk_test_123",
    webhookSecret: "whsec_platform",
    connectWebhookSecret: "whsec_connect",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses non-test API keys (BR-12)", () => {
    expect(
      () =>
        new StripePspAdapter({
          secretKey: "sk_live_forbidden",
          webhookSecret: "whsec_x",
          connectWebhookSecret: "",
        }),
    ).toThrow(/non-test/);
  });

  it("creates Connect account with participant metadata", async () => {
    accountsCreate.mockResolvedValue({ id: "acct_1" });
    const adapter = new StripePspAdapter(creds);
    const created = await adapter.createProducerAccount("part-1");
    expect(created.stripeAccountId).toBe("acct_1");
    expect(accountsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { participantId: "part-1" },
      }),
    );
  });

  it("creates onboarding Account Link", async () => {
    accountLinksCreate.mockResolvedValue({ url: "https://connect.stripe.com/setup/e/x" });
    const adapter = new StripePspAdapter(creds);
    const link = await adapter.onboardingLink("acct_1", "https://app.example/return");
    expect(link.url).toContain("connect.stripe.com");
    expect(accountLinksCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        account: "acct_1",
        type: "account_onboarding",
      }),
    );
  });

  it("retrieves payment method on attach", async () => {
    paymentMethodsRetrieve.mockResolvedValue({ id: "pm_1" });
    const adapter = new StripePspAdapter(creds);
    await expect(adapter.attachPaymentMethod("p1", "pm_1")).resolves.toEqual({
      paymentMethodId: "pm_1",
    });
  });

  it("maps payment_intent.succeeded webhook payload", () => {
    constructEvent.mockReturnValue({
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_abc", status: "succeeded" } },
    });
    const adapter = new StripePspAdapter(creds);
    const verified = adapter.verifyWebhook("{}", "sig");
    expect(verified).toEqual({
      ok: true,
      eventType: "payment_intent.succeeded",
      payload: { stripePaymentId: "pi_abc", status: "succeeded" },
    });
  });

  it("maps account.updated webhook to participantId", () => {
    constructEvent.mockReturnValue({
      type: "account.updated",
      data: {
        object: { id: "acct_1", metadata: { participantId: "part-9" } },
      },
    });
    const adapter = new StripePspAdapter(creds);
    expect(adapter.verifyWebhook("{}", "sig")).toMatchObject({
      ok: true,
      eventType: "account.updated",
      payload: { participantId: "part-9", stripeAccountId: "acct_1" },
    });
  });

  it("returns ok:false when all webhook secrets fail", () => {
    constructEvent.mockImplementation(() => {
      throw new Error("bad sig");
    });
    const adapter = new StripePspAdapter(creds);
    expect(adapter.verifyWebhook("{}", "sig")).toEqual({ ok: false });
  });

  it("returns failed category on card decline", async () => {
    paymentIntentsCreate.mockRejectedValue(
      new StripeCardError("fail", "insufficient_funds"),
    );
    const adapter = new StripePspAdapter(creds);
    const result = await adapter.createPayment({
      invoiceId: "inv-1",
      amount: "2.00",
      currency: "EUR",
      producerStripeAccountId: "acct_p",
      consumerPaymentMethodId: "pm_fail",
    });
    expect(result.status).toBe("failed");
    expect(result.failureCategory).toBe("insufficient_funds");
  });

  it("confirms destination PaymentIntent on success", async () => {
    paymentIntentsCreate.mockResolvedValue({
      id: "pi_ok",
      status: "succeeded",
    });
    const adapter = new StripePspAdapter(creds);
    const result = await adapter.createPayment({
      invoiceId: "inv-2",
      amount: "12.50",
      currency: "EUR",
      producerStripeAccountId: "acct_p",
      consumerPaymentMethodId: "pm_card_visa",
    });
    expect(result).toEqual({ stripePaymentId: "pi_ok", status: "succeeded" });
    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1250,
        currency: "eur",
        confirm: true,
        off_session: true,
        transfer_data: { destination: "acct_p" },
        metadata: { invoiceId: "inv-2" },
      }),
    );
  });

  it("refunds a PaymentIntent", async () => {
    refundsCreate.mockResolvedValue({ id: "re_1" });
    const adapter = new StripePspAdapter(creds);
    await expect(adapter.refund("pi_1")).resolves.toEqual({ status: "refunded" });
    expect(refundsCreate).toHaveBeenCalledWith({ payment_intent: "pi_1" });
  });

  it("maps processing PaymentIntent to pending", async () => {
    paymentIntentsCreate.mockResolvedValue({ id: "pi_p", status: "processing" });
    const adapter = new StripePspAdapter(creds);
    await expect(
      adapter.createPayment({
        invoiceId: "inv",
        amount: "1.00",
        currency: "EUR",
        producerStripeAccountId: "acct_p",
        consumerPaymentMethodId: "pm_1",
      }),
    ).resolves.toEqual({ stripePaymentId: "pi_p", status: "pending" });
  });

  it("maps non-succeeded PaymentIntent status to failed", async () => {
    paymentIntentsCreate.mockResolvedValue({
      id: "pi_f",
      status: "canceled",
      last_payment_error: { code: "authentication_required" },
    });
    const adapter = new StripePspAdapter(creds);
    const result = await adapter.createPayment({
      invoiceId: "inv",
      amount: "1.00",
      currency: "EUR",
      producerStripeAccountId: "acct_p",
      consumerPaymentMethodId: "pm_1",
    });
    expect(result).toEqual({
      stripePaymentId: "pi_f",
      status: "failed",
      failureCategory: "authentication_required",
    });
  });

  it("returns ok:false when no webhook secrets configured", () => {
    const adapter = new StripePspAdapter({
      secretKey: "sk_test_123",
      webhookSecret: "",
      connectWebhookSecret: "",
    });
    expect(adapter.verifyWebhook("{}", "sig")).toEqual({ ok: false });
  });

  it("falls through unknown event types with raw object payload", () => {
    constructEvent.mockReturnValue({
      type: "ping",
      data: { object: { hello: "world" } },
    });
    const adapter = new StripePspAdapter(creds);
    expect(adapter.verifyWebhook("{}", "sig")).toEqual({
      ok: true,
      eventType: "ping",
      payload: { hello: "world" },
    });
  });

  it("tries connect webhook secret when platform secret fails", () => {
    constructEvent
      .mockImplementationOnce(() => {
        throw new Error("platform");
      })
      .mockReturnValueOnce({
        type: "account.updated",
        data: { object: { id: "acct_x", metadata: {} } },
      });
    const adapter = new StripePspAdapter(creds);
    expect(adapter.verifyWebhook("{}", "sig").ok).toBe(true);
    expect(constructEvent).toHaveBeenCalledTimes(2);
  });
});
