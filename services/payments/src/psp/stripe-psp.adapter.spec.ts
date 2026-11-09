import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  accountsCreate,
  accountsRetrieve,
  accountsUpdate,
  tokensCreate,
  paymentMethodsRetrieve,
  paymentMethodsCreate,
  paymentMethodsAttach,
  paymentIntentsCreate,
  paymentIntentsUpdate,
  refundsCreate,
  customersCreate,
  setupIntentsCreate,
  setupIntentsList,
  mandatesRetrieve,
  invoicesRetrieve,
  invoicesPay,
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
    paymentMethodsCreate: vi.fn(),
    paymentMethodsAttach: vi.fn(),
    paymentIntentsCreate: vi.fn(),
    paymentIntentsUpdate: vi.fn(),
    refundsCreate: vi.fn(),
    customersCreate: vi.fn(),
    setupIntentsCreate: vi.fn(),
    setupIntentsList: vi.fn(),
    mandatesRetrieve: vi.fn(),
    invoicesRetrieve: vi.fn(),
    invoicesPay: vi.fn(),
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
      paymentMethods: {
        retrieve: paymentMethodsRetrieve,
        create: paymentMethodsCreate,
        attach: paymentMethodsAttach,
      },
      paymentIntents: { create: paymentIntentsCreate, update: paymentIntentsUpdate },
      refunds: { create: refundsCreate },
      customers: { create: customersCreate },
      setupIntents: { create: setupIntentsCreate, list: setupIntentsList },
      mandates: { retrieve: mandatesRetrieve },
      invoices: { retrieve: invoicesRetrieve, pay: invoicesPay },
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
        // INT-276 / REQ-014 — card or SEPA Direct Debit (Stripe SDK v23).
        allowed_payment_method_types: ["card", "sepa_debit"],
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
        // INT-355 — card and SEPA direct charges on the producer account.
        capabilities: {
          card_payments: { requested: true },
          sepa_debit_payments: { requested: true },
          transfers: { requested: true },
        },
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

  it("includes DOB and identity document file tokens in account token (INT-195)", async () => {
    tokensCreate.mockResolvedValue({ id: "ct_kyc_docs" });
    const adapter = new StripePspAdapter(creds);
    await adapter.createAccountToken({
      businessType: "individual",
      tosAccepted: true,
      identityDocumentFront: "file_identity_document_success",
      representative: {
        firstName: "Ada",
        lastName: "Verified",
        email: "ada@example.com",
        dob: { day: 1, month: 1, year: 1902 },
        address: {
          line1: "address_full_match",
          city: "Paris",
          postalCode: "75002",
          country: "FR",
        },
      },
    });
    expect(tokensCreate).toHaveBeenCalledWith({
      account: expect.objectContaining({
        individual: expect.objectContaining({
          dob: { day: 1, month: 1, year: 1902 },
          address: expect.objectContaining({ line1: "address_full_match" }),
          verification: {
            document: { front: "file_identity_document_success" },
            additional_document: { front: "file_identity_document_success" },
          },
        }),
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

  it("returns SEPA last4 for sepa_debit PaymentMethod (INT-276)", async () => {
    paymentMethodsRetrieve.mockResolvedValue({
      id: "pm_sepa",
      type: "sepa_debit",
      sepa_debit: { last4: "3000" },
    });
    const adapter = new StripePspAdapter(creds);
    await expect(adapter.getPaymentMethodDetails("pm_sepa")).resolves.toEqual({
      paymentMethodId: "pm_sepa",
      type: "sepa_debit",
      brand: "sepa_debit",
      last4: "3000",
    });
  });

  it("returns brand and last4 for Ready Payment method UI (INT-255)", async () => {
    paymentMethodsRetrieve.mockResolvedValue({
      id: "pm_1",
      type: "card",
      card: { brand: "visa", last4: "4242" },
    });
    const adapter = new StripePspAdapter(creds);
    await expect(adapter.getPaymentMethodDetails("pm_1")).resolves.toEqual({
      paymentMethodId: "pm_1",
      type: "card",
      brand: "visa",
      last4: "4242",
    });
  });

  it("maps payment_intent.succeeded webhook payload", () => {
    constructEvent.mockReturnValue({
      id: "evt_pi_1",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_abc", status: "succeeded" } },
    });
    const adapter = new StripePspAdapter(creds);
    const verified = adapter.verifyWebhook("{}", "sig");
    expect(verified).toEqual({
      ok: true,
      eventId: "evt_pi_1",
      eventType: "payment_intent.succeeded",
      payload: { stripePaymentId: "pi_abc", status: "succeeded" },
    });
  });

  it("UAT-014 maps Connect invoice.paid / invoice.payment_failed with the connected account (INT-355)", () => {
    const adapter = new StripePspAdapter(creds);
    constructEvent.mockReturnValueOnce({
      id: "evt_inv_paid",
      type: "invoice.paid",
      account: "acct_p",
      data: { object: { id: "in_1", status: "paid" } },
    });
    expect(adapter.verifyWebhook("{}", "sig")).toEqual({
      ok: true,
      eventId: "evt_inv_paid",
      eventType: "invoice.paid",
      payload: { stripeInvoiceId: "in_1", status: "paid", stripeAccountId: "acct_p" },
    });
    constructEvent.mockReturnValueOnce({
      id: "evt_inv_failed",
      type: "invoice.payment_failed",
      data: { object: { id: "in_2", status: "open" } },
    });
    expect(adapter.verifyWebhook("{}", "sig").payload).toEqual({
      stripeInvoiceId: "in_2",
      status: "open",
    });
  });

  it("maps Connect payment_intent.payment_failed with its decline category (INT-355)", () => {
    const adapter = new StripePspAdapter(creds);
    constructEvent.mockReturnValueOnce({
      id: "evt_pi_failed",
      type: "payment_intent.payment_failed",
      account: "acct_p",
      data: {
        object: {
          id: "pi_c",
          status: "requires_payment_method",
          last_payment_error: { code: "card_declined", decline_code: "insufficient_funds" },
        },
      },
    });
    expect(adapter.verifyWebhook("{}", "sig").payload).toEqual({
      stripePaymentId: "pi_c",
      status: "requires_payment_method",
      stripeAccountId: "acct_p",
      failureCategory: "insufficient_funds",
    });
    constructEvent.mockReturnValueOnce({
      id: "evt_pi_failed_2",
      type: "payment_intent.payment_failed",
      data: { object: { id: "pi_d", status: "canceled", last_payment_error: {} } },
    });
    expect(adapter.verifyWebhook("{}", "sig").payload).toMatchObject({
      failureCategory: "declined",
    });
  });

  it("maps account.updated webhook to participantId", () => {
    constructEvent.mockReturnValue({
      id: "evt_acct_1",
      type: "account.updated",
      data: {
        object: { id: "acct_1", metadata: { participantId: "part-9" } },
      },
    });
    const adapter = new StripePspAdapter(creds);
    expect(adapter.verifyWebhook("{}", "sig")).toMatchObject({
      ok: true,
      eventId: "evt_acct_1",
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

  describe("UAT-014 / UAT-015 REQ-014 direct charge on the producer Connect account (INT-355)", () => {
    const connect = { stripeAccount: "acct_p" };
    const payInput = {
      invoiceId: "inv-2",
      amount: "12.50",
      currency: "EUR",
      producerStripeAccountId: "acct_p",
      stripeInvoiceId: "in_1",
      connectedCustomerId: "cus_conn",
      consumerPaymentMethodId: "pm_platform",
    };
    const openInvoice = {
      id: "in_1",
      status: "open",
      amount_due: 1250,
      currency: "eur",
      customer: "cus_conn",
    };

    beforeEach(() => {
      invoicesRetrieve.mockResolvedValue(openInvoice);
      paymentMethodsRetrieve.mockResolvedValue({
        id: "pm_platform",
        type: "card",
        customer: "cus_platform",
      });
      paymentMethodsCreate.mockResolvedValue({ id: "pm_clone" });
      paymentMethodsAttach.mockResolvedValue({ id: "pm_clone" });
    });

    it("creates the connected-account Customer with participantId metadata only", async () => {
      customersCreate.mockResolvedValue({ id: "cus_conn" });
      const adapter = new StripePspAdapter(creds);
      await expect(
        adapter.createConnectedCustomer({ participantId: "part-1", stripeAccountId: "acct_p" }),
      ).resolves.toEqual({ stripeCustomerId: "cus_conn" });
      expect(customersCreate).toHaveBeenCalledWith(
        { metadata: { participantId: "part-1" } },
        connect,
      );
    });

    it("clones the platform PaymentMethod and pays the invoice on the connected account", async () => {
      invoicesRetrieve.mockResolvedValue({
        ...openInvoice,
        payments: { data: [{ is_default: true, payment: { payment_intent: "pi_conn" } }] },
      });
      invoicesPay.mockResolvedValue({
        id: "in_1",
        status: "paid",
        payments: {
          data: [{ is_default: true, payment: { type: "payment_intent", payment_intent: "pi_conn" } }],
        },
      });
      const adapter = new StripePspAdapter(creds);
      await expect(adapter.createPayment(payInput)).resolves.toEqual({
        stripePaymentId: "pi_conn",
        status: "succeeded",
      });
      expect(invoicesRetrieve).toHaveBeenCalledWith("in_1", { expand: ["payments"] }, connect);
      expect(paymentMethodsRetrieve).toHaveBeenCalledWith("pm_platform");
      expect(paymentMethodsCreate).toHaveBeenCalledWith(
        { customer: "cus_platform", payment_method: "pm_platform" },
        connect,
      );
      expect(paymentMethodsAttach).toHaveBeenCalledWith(
        "pm_clone",
        { customer: "cus_conn" },
        connect,
      );
      expect(paymentIntentsUpdate).toHaveBeenCalledWith(
        "pi_conn",
        { metadata: { invoiceId: "inv-2" } },
        connect,
      );
      expect(invoicesPay).toHaveBeenCalledWith(
        "in_1",
        { payment_method: "pm_clone", off_session: true, expand: ["payments"] },
        connect,
      );
      // REQ-014 — no platform charge and no transfer_data destination.
      expect(paymentIntentsCreate).not.toHaveBeenCalled();
      expect(JSON.stringify(invoicesPay.mock.calls)).not.toContain("transfer_data");
      expect(setupIntentsList).not.toHaveBeenCalled();
    });

    it("attaches to the invoice's own Customer when it differs from the mapping", async () => {
      invoicesRetrieve.mockResolvedValue({ ...openInvoice, customer: { id: "cus_legacy" } });
      invoicesPay.mockResolvedValue({ id: "in_1", status: "paid" });
      const adapter = new StripePspAdapter(creds);
      await expect(adapter.createPayment(payInput)).resolves.toEqual({
        stripePaymentId: "in_1",
        status: "succeeded",
      });
      expect(paymentMethodsAttach).toHaveBeenCalledWith(
        "pm_clone",
        { customer: "cus_legacy" },
        connect,
      );
    });

    it("falls back to the mapped Customer when the invoice has none", async () => {
      invoicesRetrieve.mockResolvedValue({ ...openInvoice, customer: null });
      invoicesPay.mockResolvedValue({ id: "in_1", status: "paid" });
      const adapter = new StripePspAdapter(creds);
      await adapter.createPayment(payInput);
      expect(paymentMethodsAttach).toHaveBeenCalledWith(
        "pm_clone",
        { customer: "cus_conn" },
        connect,
      );
      // No PaymentIntent exposed on the invoice: nothing to tag.
      expect(paymentIntentsUpdate).not.toHaveBeenCalled();
    });

    it("returns succeeded without charging when the invoice is already paid", async () => {
      invoicesRetrieve.mockResolvedValue({
        ...openInvoice,
        status: "paid",
        payments: { data: [{ is_default: false, payment: { payment_intent: { id: "pi_old" } } }] },
      });
      const adapter = new StripePspAdapter(creds);
      await expect(adapter.createPayment(payInput)).resolves.toEqual({
        stripePaymentId: "pi_old",
        status: "succeeded",
      });
      expect(paymentMethodsCreate).not.toHaveBeenCalled();
      expect(invoicesPay).not.toHaveBeenCalled();
    });

    it("refuses void / draft invoices", async () => {
      invoicesRetrieve.mockResolvedValue({ ...openInvoice, status: "void" });
      const adapter = new StripePspAdapter(creds);
      await expect(adapter.createPayment(payInput)).resolves.toEqual({
        stripePaymentId: "in_1",
        status: "failed",
        failureCategory: "invoice_not_payable",
      });
      expect(invoicesPay).not.toHaveBeenCalled();
    });

    it("refuses an amount or currency that differs from the Stripe invoice", async () => {
      invoicesRetrieve.mockResolvedValue({ ...openInvoice, amount_due: 999 });
      const adapter = new StripePspAdapter(creds);
      await expect(adapter.createPayment(payInput)).resolves.toMatchObject({
        status: "failed",
        failureCategory: "amount_mismatch",
      });
      invoicesRetrieve.mockResolvedValue({ ...openInvoice, currency: "chf" });
      await expect(adapter.createPayment(payInput)).resolves.toMatchObject({
        failureCategory: "amount_mismatch",
      });
      expect(invoicesPay).not.toHaveBeenCalled();
    });

    it("fails when the platform PaymentMethod has no platform Customer", async () => {
      paymentMethodsRetrieve.mockResolvedValue({ id: "pm_platform", type: "card", customer: null });
      const adapter = new StripePspAdapter(creds);
      await expect(adapter.createPayment(payInput)).resolves.toMatchObject({
        status: "failed",
        failureCategory: "payment_method_not_attached",
      });
    });

    it("maps an open invoice after pay (async SEPA / requires_action) to pending", async () => {
      invoicesPay.mockResolvedValue({ id: "in_1", status: "open" });
      const adapter = new StripePspAdapter(creds);
      await expect(adapter.createPayment(payInput)).resolves.toEqual({
        stripePaymentId: "in_1",
        status: "pending",
      });
    });

    it("maps any other invoice status after pay to failed", async () => {
      invoicesPay.mockResolvedValue({ id: "in_1", status: "uncollectible" });
      const adapter = new StripePspAdapter(creds);
      await expect(adapter.createPayment(payInput)).resolves.toMatchObject({
        status: "failed",
        failureCategory: "declined",
      });
    });

    it("returns the failure category and PaymentIntent of a declined card", async () => {
      invoicesPay.mockRejectedValue(
        Object.assign(new StripeCardError("fail", "insufficient_funds"), {
          payment_intent: { id: "pi_declined" },
        }),
      );
      const adapter = new StripePspAdapter(creds);
      await expect(adapter.createPayment(payInput)).resolves.toEqual({
        stripePaymentId: "pi_declined",
        status: "failed",
        failureCategory: "insufficient_funds",
      });
    });

    it("maps authentication and generic errors", async () => {
      const adapter = new StripePspAdapter(creds);
      invoicesPay.mockRejectedValue(
        Object.assign(new Error("x"), { code: "authentication_required" }),
      );
      await expect(adapter.createPayment(payInput)).resolves.toMatchObject({
        stripePaymentId: "in_1",
        failureCategory: "authentication_required",
      });
      invoicesRetrieve.mockRejectedValue(new Error("network down"));
      await expect(adapter.createPayment(payInput)).resolves.toMatchObject({
        failureCategory: "declined",
      });
      invoicesRetrieve.mockRejectedValue({});
      await expect(adapter.createPayment(payInput)).resolves.toMatchObject({
        failureCategory: "declined",
      });
    });

    describe("SEPA Direct Debit", () => {
      beforeEach(() => {
        paymentMethodsRetrieve.mockResolvedValue({
          id: "pm_platform",
          type: "sepa_debit",
          customer: { id: "cus_platform" },
        });
        invoicesPay.mockResolvedValue({ id: "in_1", status: "open" });
      });

      it("re-creates the mandate on the connected account from the online acceptance", async () => {
        setupIntentsList.mockResolvedValue({
          data: [
            { status: "requires_payment_method", mandate: null },
            { status: "succeeded", mandate: "mandate_platform" },
          ],
        });
        mandatesRetrieve.mockResolvedValue({
          customer_acceptance: {
            type: "online",
            accepted_at: 1700000000,
            online: { ip_address: "203.0.113.1", user_agent: "UA" },
          },
        });
        setupIntentsCreate.mockResolvedValue({ id: "seti_c", mandate: { id: "mandate_conn" } });
        const adapter = new StripePspAdapter(creds);
        await expect(adapter.createPayment(payInput)).resolves.toEqual({
          stripePaymentId: "in_1",
          status: "pending",
        });
        expect(setupIntentsList).toHaveBeenCalledWith({ payment_method: "pm_platform", limit: 10 });
        expect(setupIntentsCreate).toHaveBeenCalledWith(
          {
            customer: "cus_conn",
            payment_method: "pm_clone",
            confirm: true,
            usage: "off_session",
            allowed_payment_method_types: ["sepa_debit"],
            mandate_data: {
              customer_acceptance: {
                type: "online",
                accepted_at: 1700000000,
                online: { ip_address: "203.0.113.1", user_agent: "UA" },
              },
            },
          },
          connect,
        );
        expect(invoicesPay).toHaveBeenCalledWith(
          "in_1",
          {
            payment_method: "pm_clone",
            off_session: true,
            mandate: "mandate_conn",
            expand: ["payments"],
          },
          connect,
        );
      });

      it("falls back to offline acceptance when online details are missing", async () => {
        setupIntentsList.mockResolvedValue({
          data: [{ status: "succeeded", mandate: { id: "mandate_platform" } }],
        });
        mandatesRetrieve.mockResolvedValue({
          customer_acceptance: { type: "offline", accepted_at: null },
        });
        setupIntentsCreate.mockResolvedValue({ id: "seti_c", mandate: "mandate_conn" });
        const adapter = new StripePspAdapter(creds);
        await adapter.createPayment(payInput);
        expect(setupIntentsCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            mandate_data: {
              customer_acceptance: { type: "offline", accepted_at: undefined, offline: {} },
            },
          }),
          connect,
        );
      });

      it("fails as mandate_required without a platform mandate", async () => {
        setupIntentsList.mockResolvedValue({ data: [] });
        const adapter = new StripePspAdapter(creds);
        await expect(adapter.createPayment(payInput)).resolves.toMatchObject({
          status: "failed",
          failureCategory: "mandate_required",
        });
        expect(invoicesPay).not.toHaveBeenCalled();
      });

      it("fails as mandate_required when Stripe returns no connected mandate", async () => {
        setupIntentsList.mockResolvedValue({
          data: [{ status: "succeeded", mandate: "mandate_platform" }],
        });
        mandatesRetrieve.mockResolvedValue({
          customer_acceptance: { type: "online", accepted_at: 1, online: {} },
        });
        setupIntentsCreate.mockResolvedValue({ id: "seti_c", mandate: null });
        const adapter = new StripePspAdapter(creds);
        await expect(adapter.createPayment(payInput)).resolves.toMatchObject({
          failureCategory: "mandate_required",
        });
      });
    });
  });

  it("refunds a PaymentIntent", async () => {
    refundsCreate.mockResolvedValue({ id: "re_1" });
    const adapter = new StripePspAdapter(creds);
    await expect(adapter.refund("pi_1")).resolves.toEqual({ status: "refunded" });
    expect(refundsCreate).toHaveBeenCalledWith({ payment_intent: "pi_1" });
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
      id: "evt_ping",
      type: "ping",
      data: { object: { hello: "world" } },
    });
    const adapter = new StripePspAdapter(creds);
    expect(adapter.verifyWebhook("{}", "sig")).toEqual({
      ok: true,
      eventId: "evt_ping",
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
        id: "evt_acct_x",
        type: "account.updated",
        data: { object: { id: "acct_x", metadata: {} } },
      });
    const adapter = new StripePspAdapter(creds);
    expect(adapter.verifyWebhook("{}", "sig").ok).toBe(true);
    expect(constructEvent).toHaveBeenCalledTimes(2);
  });
});
