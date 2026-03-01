import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  accountsCreate,
  accountsRetrieve,
  accountsUpdate,
  tokensCreate,
  paymentMethodsRetrieve,
  paymentIntentsCreate,
  refundsCreate,
  customersCreate,
  setupIntentsCreate,
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
    accountsRetrieve: vi.fn(),
    accountsUpdate: vi.fn(),
    tokensCreate: vi.fn(),
    paymentMethodsRetrieve: vi.fn(),
    paymentIntentsCreate: vi.fn(),
    refundsCreate: vi.fn(),
    customersCreate: vi.fn(),
    setupIntentsCreate: vi.fn(),
    constructEvent: vi.fn(),
    StripeCardError,
  };
});

vi.mock("stripe", () => {
  function Stripe() {
    return {
      accounts: {
        create: accountsCreate,
        retrieve: accountsRetrieve,
        update: accountsUpdate,
      },
      tokens: { create: tokensCreate },
      paymentMethods: { retrieve: paymentMethodsRetrieve },
      paymentIntents: { create: paymentIntentsCreate },
      refunds: { create: refundsCreate },
      customers: { create: customersCreate },
      setupIntents: { create: setupIntentsCreate },
      webhooks: { constructEvent },
    };
  }
  Stripe.errors = { StripeCardError };
  return { default: Stripe, Stripe };
});

import { StripePspAdapter } from "./stripe-psp.adapter.js";

describe("StripePspAdapter (INT-189 / INT-191)", () => {
  const creds = {
    secretKey: "sk_test_123",
    webhookSecret: "whsec_platform",
    connectWebhookSecret: "whsec_connect",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates SetupIntent for consumer payment method (INT-193)", async () => {
    customersCreate.mockResolvedValue({ id: "cus_1" });
    setupIntentsCreate.mockResolvedValue({
      id: "seti_1",
      client_secret: "seti_1_secret_x",
    });
    const adapter = new StripePspAdapter(creds);
    await expect(adapter.createSetupIntent("p-consumer")).resolves.toEqual({
      clientSecret: "seti_1_secret_x",
    });
    expect(setupIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_1",
        usage: "off_session",
        metadata: { participantId: "p-consumer" },
      }),
    );
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

  it("creates Custom Connect account with account_token (INT-191)", async () => {
    accountsCreate.mockResolvedValue({ id: "acct_1" });
    const adapter = new StripePspAdapter(creds);
    const created = await adapter.createProducerAccount({
      participantId: "part-1",
      accountToken: "ct_test_abc",
      country: "FR",
    });
    expect(created.stripeAccountId).toBe("acct_1");
    expect(accountsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        country: "FR",
        account_token: "ct_test_abc",
        controller: expect.objectContaining({
          stripe_dashboard: { type: "none" },
          fees: { payer: "application" },
          losses: { payments: "application" },
          requirement_collection: "application",
        }),
        metadata: { participantId: "part-1" },
      }),
    );
  });

  it("defaults Custom account country to FR (INT-191)", async () => {
    accountsCreate.mockResolvedValue({ id: "acct_fr" });
    const adapter = new StripePspAdapter(creds);
    await adapter.createProducerAccount({
      participantId: "part-2",
      accountToken: "ct_x",
    });
    expect(accountsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ country: "FR" }),
    );
  });

  it("creates account token from KYC fields (INT-191)", async () => {
    tokensCreate.mockResolvedValue({ id: "ct_from_server" });
    const adapter = new StripePspAdapter(creds);
    const id = await adapter.createAccountToken({
      businessType: "individual",
      tosAccepted: true,
      representative: {
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        address: { line1: "1 Rue", city: "Paris", postalCode: "75001", country: "FR" },
      },
    });
    expect(id).toBe("ct_from_server");
    expect(tokensCreate).toHaveBeenCalledWith({
      account: expect.objectContaining({
        business_type: "individual",
        tos_shown_and_accepted: true,
        individual: expect.objectContaining({ first_name: "Ada" }),
      }),
    });
  });

  it("creates ToS-only account token and rejects empty token id (INT-191)", async () => {
    tokensCreate.mockResolvedValueOnce({ id: "ct_tos" });
    const adapter = new StripePspAdapter(creds);
    await expect(
      adapter.createAccountToken({ tosAccepted: true }),
    ).resolves.toBe("ct_tos");
    tokensCreate.mockResolvedValueOnce({});
    await expect(adapter.createAccountToken({ tosAccepted: true })).rejects.toThrow(
      /no id/,
    );
  });

  it("reads Connect requirements session (INT-190)", async () => {
    accountsRetrieve.mockResolvedValue({
      id: "acct_1",
      details_submitted: false,
      charges_enabled: false,
      requirements: {
        currently_due: ["business_type", "tos_acceptance.date"],
        eventually_due: [],
        pending_verification: [],
      },
    });
    const adapter = new StripePspAdapter(creds);
    const session = await adapter.getAccountSession("acct_1");
    expect(session).toEqual({
      mode: "requirements",
      status: "requirements_due",
      stripeAccountId: "acct_1",
      currentlyDue: ["business_type", "tos_acceptance.date"],
      eventuallyDue: [],
    });
  });

  it("submits KYC via account_token + business_profile (INT-191)", async () => {
    tokensCreate.mockResolvedValue({ id: "ct_built" });
    accountsUpdate.mockResolvedValue({
      id: "acct_1",
      details_submitted: true,
      charges_enabled: true,
      requirements: { currently_due: [], eventually_due: [], pending_verification: [] },
    });
    const adapter = new StripePspAdapter(creds);
    const session = await adapter.submitAccountRequirements(
      "acct_1",
      {
        businessType: "individual",
        businessProfileUrl: "https://example.com",
        businessProfileMcc: "5734",
        representative: {
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.com",
          phone: "+331234",
          dob: { day: 1, month: 12, year: 1990 },
          address: {
            line1: "1 Rue",
            city: "Paris",
            postalCode: "75001",
            country: "FR",
          },
        },
        externalAccount: {
          country: "FR",
          currency: "EUR",
          accountNumber: "FR1420041010050500013M02606",
        },
        tosAccepted: true,
      },
      "203.0.113.10",
    );
    expect(session.status).toBe("complete");
    expect(tokensCreate).toHaveBeenCalled();
    expect(accountsUpdate).toHaveBeenCalledWith(
      "acct_1",
      expect.objectContaining({
        account_token: "ct_built",
        business_profile: { url: "https://example.com", mcc: "5734" },
        external_account: expect.objectContaining({
          country: "FR",
          account_number: "FR1420041010050500013M02606",
        }),
      }),
    );
  });

  it("uses supplied accountToken without calling tokens.create (INT-191)", async () => {
    accountsUpdate.mockResolvedValue({
      id: "acct_2",
      details_submitted: false,
      charges_enabled: false,
      requirements: {
        currently_due: ["business_profile.mcc"],
        eventually_due: [],
        pending_verification: [],
      },
    });
    const adapter = new StripePspAdapter(creds);
    await adapter.submitAccountRequirements(
      "acct_2",
      { accountToken: "ct_client", businessProfileMcc: "5734" },
      "",
    );
    expect(tokensCreate).not.toHaveBeenCalled();
    expect(accountsUpdate).toHaveBeenCalledWith(
      "acct_2",
      expect.objectContaining({
        account_token: "ct_client",
        business_profile: { mcc: "5734" },
      }),
    );
  });

  it("updates business_profile url only and bank with routing number (INT-191)", async () => {
    accountsUpdate.mockResolvedValue({
      id: "acct_3",
      details_submitted: false,
      charges_enabled: false,
      requirements: {
        currently_due: ["business_profile.url"],
        eventually_due: [],
        pending_verification: [],
      },
    });
    const adapter = new StripePspAdapter(creds);
    await adapter.submitAccountRequirements(
      "acct_3",
      {
        businessProfileUrl: "https://only-url.example",
        externalAccount: {
          country: "FR",
          accountNumber: "FR1420041010050500013M02606",
          routingNumber: "110000000",
        },
      },
      "1.2.3.4",
    );
    expect(tokensCreate).not.toHaveBeenCalled();
    expect(accountsUpdate).toHaveBeenCalledWith(
      "acct_3",
      expect.objectContaining({
        business_profile: { url: "https://only-url.example" },
        external_account: expect.objectContaining({
          routing_number: "110000000",
          currency: "eur",
        }),
      }),
    );
  });

  it("maps pending_verification session status (INT-190)", async () => {
    accountsRetrieve.mockResolvedValue({
      id: "acct_2",
      details_submitted: false,
      charges_enabled: false,
      requirements: {
        currently_due: [],
        eventually_due: ["individual.verification.document"],
        pending_verification: ["individual.verification.document"],
      },
    });
    const adapter = new StripePspAdapter(creds);
    await expect(adapter.getAccountSession("acct_2")).resolves.toMatchObject({
      status: "pending_verification",
    });
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
