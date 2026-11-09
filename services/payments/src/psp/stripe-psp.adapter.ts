import Stripe from "stripe";
import type {
  CreateEmbeddedProducerAccountInput,
  CreateProducerAccountInput,
  OnboardingRequirementsSubmission,
  OnboardingSession,
  PaymentMethodDetails,
  PaymentMethodRef,
  ProducerAccount,
  PspPaymentInput,
  PspPaymentResult,
  PspPort,
  WebhookVerification,
} from "./psp.port.js";
import { readStripeEnv, toMinorUnits, type StripeEnv } from "./stripe-env.js";

/**
 * Real Stripe test-mode P-PSP adapter (INT-189 / INT-190 / INT-191 / AD-6 / BR-12).
 * Direct charges: the producer's Stripe invoice is paid on the producer Connect
 * account (INT-355 / REQ-014 / TD-6).
 * FR Custom accounts via Account Tokens (requirement_collection=application).
 */
export class StripePspAdapter implements PspPort {
  private readonly stripe: Stripe;
  private readonly webhookSecrets: string[];

  constructor(creds: StripeEnv = readStripeEnv()!) {
    if (!creds?.secretKey) {
      throw new Error("StripePspAdapter requires stripe_secret_key");
    }
    // BR-12 — test-mode secret only (sk_test_ / rk_test_).
    if (!/_test_/.test(creds.secretKey)) {
      throw new Error("StripePspAdapter refuses non-test API keys (BR-12)");
    }
    this.stripe = new Stripe(creds.secretKey);
    this.webhookSecrets = [creds.webhookSecret, creds.connectWebhookSecret].filter(
      (s) => s.length > 0,
    );
  }

  async createAccountToken(
    submission: OnboardingRequirementsSubmission,
  ): Promise<string> {
    const account: Stripe.TokenCreateParams.Account = {
      tos_shown_and_accepted: Boolean(submission.tosAccepted),
    };
    if (submission.businessType) {
      account.business_type = submission.businessType;
    }
    const rep = submission.representative;
    if (submission.businessType === "individual" || rep) {
      // INT-195 — include DOB + optional identity document for test verification.
      const individual: Stripe.TokenCreateParams.Account.Individual = {
        first_name: rep?.firstName,
        last_name: rep?.lastName,
        email: rep?.email,
        phone: rep?.phone,
        dob: rep?.dob
          ? { day: rep.dob.day, month: rep.dob.month, year: rep.dob.year }
          : undefined,
        address: rep?.address
          ? {
              line1: rep.address.line1,
              city: rep.address.city,
              postal_code: rep.address.postalCode,
              country: rep.address.country,
            }
          : undefined,
      };
      const docFront = submission.identityDocumentFront;
      const addlFront =
        submission.identityDocumentAdditionalFront ?? docFront;
      if (docFront || addlFront) {
        individual.verification = {};
        if (docFront) {
          individual.verification.document = { front: docFront };
        }
        if (addlFront) {
          individual.verification.additional_document = { front: addlFront };
        }
      }
      account.individual = individual;
    }
    const token = await this.stripe.tokens.create({ account });
    if (!token.id) {
      throw new Error("Stripe tokens.create returned no id");
    }
    return token.id;
  }

  async createProducerAccount(
    input: CreateProducerAccountInput,
  ): Promise<ProducerAccount> {
    // INT-191 — Custom Connect with controller properties + account_token (FR PSD2).
    const account = await this.stripe.accounts.create({
      country: (input.country ?? "FR").toUpperCase(),
      account_token: input.accountToken,
      controller: {
        stripe_dashboard: { type: "none" },
        fees: { payer: "application" },
        losses: { payments: "application" },
        requirement_collection: "application",
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { participantId: input.participantId },
    });
    return { stripeAccountId: account.id };
  }

  async createEmbeddedProducerAccount(
    input: CreateEmbeddedProducerAccountInput,
  ): Promise<ProducerAccount> {
    // INT-362 — fees and disputes on the producer; Stripe collects KYC and the
    // terms of service, and covers losses the producer cannot repay.
    // card_payments needs transfers (Stripe capability rule).
    const account = await this.stripe.accounts.create({
      country: (input.country ?? "FR").toUpperCase(),
      controller: {
        stripe_dashboard: { type: "none" },
        fees: { payer: "account" },
        losses: { payments: "stripe" },
        requirement_collection: "stripe",
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { participantId: input.participantId },
    });
    return { stripeAccountId: account.id };
  }

  async createAccountOnboardingSession(
    stripeAccountId: string,
  ): Promise<{ clientSecret: string }> {
    const session = await this.stripe.accountSessions.create({
      account: stripeAccountId,
      components: { account_onboarding: { enabled: true } },
    });
    return { clientSecret: session.client_secret };
  }

  async getAccountSession(stripeAccountId: string): Promise<OnboardingSession> {
    const account = await this.stripe.accounts.retrieve(stripeAccountId);
    return sessionFromAccount(account);
  }

  async submitAccountRequirements(
    stripeAccountId: string,
    submission: OnboardingRequirementsSubmission,
    _clientIp: string,
  ): Promise<OnboardingSession> {
    const params: Stripe.AccountUpdateParams = {};

    // INT-191 — legal entity / ToS via account_token (required for FR platforms).
    let accountToken = submission.accountToken;
    if (!accountToken && hasTokenizableKyc(submission)) {
      accountToken = await this.createAccountToken(submission);
    }
    if (accountToken) {
      params.account_token = accountToken;
    }

    // business_profile and external_account are outside the token (Stripe docs).
    if (submission.businessProfileUrl || submission.businessProfileMcc) {
      params.business_profile = {};
      if (submission.businessProfileUrl) {
        params.business_profile.url = submission.businessProfileUrl;
      }
      if (submission.businessProfileMcc) {
        params.business_profile.mcc = submission.businessProfileMcc;
      }
    }
    if (submission.externalAccount?.accountNumber && submission.externalAccount.country) {
      params.external_account = {
        object: "bank_account",
        country: submission.externalAccount.country,
        currency: (submission.externalAccount.currency ?? "eur").toLowerCase(),
        account_number: submission.externalAccount.accountNumber,
        ...(submission.externalAccount.routingNumber
          ? { routing_number: submission.externalAccount.routingNumber }
          : {}),
      };
    }

    const account = await this.stripe.accounts.update(stripeAccountId, params);
    return sessionFromAccount(account);
  }

  async createSetupIntent(
    participantId: string,
  ): Promise<{ clientSecret: string }> {
    // INT-193 — customer scoped by participant metadata for reuse.
    const customer = await this.stripe.customers.create({
      metadata: { participantId },
    });
    // INT-361 / REQ-014 — cards only in V1: a platform sepa_debit
    // PaymentMethod cannot be shared to the producer's connected account
    // (direct charge, INT-355). Twint/PayPal out of scope.
    // Stripe SDK v23: use allowed_payment_method_types (payment_method_types removed).
    const intent = await this.stripe.setupIntents.create({
      customer: customer.id,
      usage: "off_session",
      allowed_payment_method_types: ["card"],
      metadata: { participantId },
    });
    if (!intent.client_secret) {
      throw new Error("SetupIntent missing client_secret");
    }
    return { clientSecret: intent.client_secret };
  }

  /**
   * INT-363 — a card already on a platform Customer is shareable as-is.
   * The reusable test token `pm_card_*` is not: Stripe returns a new,
   * Customer-less PaymentMethod when it is retrieved, so the token saved on
   * the account is what identifies it. Attach it once to a platform Customer
   * (reused by metadata) and return that PaymentMethod.
   */
  private async shareablePlatformCard(
    pm: Stripe.PaymentMethod,
    token: string,
  ): Promise<{ id: string; customerId: string } | null> {
    const existing = stripeId(pm.customer);
    if (existing) return { id: pm.id, customerId: existing };
    if (!/^pm_card_[A-Za-z0-9]+$/.test(token)) return null;

    let customerId: string | undefined;
    try {
      const found = await this.stripe.customers.search({
        query: `metadata['paymentMethodToken']:'${token}'`,
        limit: 1,
      });
      const reused = found.data[0];
      if (reused) {
        const methods = await this.stripe.paymentMethods.list({
          customer: reused.id,
          type: "card",
          limit: 1,
        });
        const card = methods.data[0];
        if (card) return { id: card.id, customerId: reused.id };
        customerId = reused.id;
      }
    } catch {
      // Search can be unavailable; attaching below still makes the token shareable.
    }
    if (!customerId) {
      const created = await this.stripe.customers.create({
        metadata: { paymentMethodToken: token },
      });
      customerId = created.id;
    }
    const attached = await this.stripe.paymentMethods.attach(token, {
      customer: customerId,
    });
    return { id: attached.id, customerId: stripeId(attached.customer) ?? customerId };
  }

  async attachPaymentMethod(
    _participantId: string,
    paymentMethodId: string,
  ): Promise<PaymentMethodRef> {
    // Validate the PaymentMethod exists in test mode; attachment to a Customer
    // is deferred until pay time if the PM is already platform-scoped.
    const pm = await this.stripe.paymentMethods.retrieve(paymentMethodId);
    return { paymentMethodId: pm.id };
  }

  async getPaymentMethodDetails(
    paymentMethodId: string,
  ): Promise<PaymentMethodDetails> {
    const pm = await this.stripe.paymentMethods.retrieve(paymentMethodId);
    const type = pm.type ?? "card";
    if (type === "sepa_debit") {
      return {
        paymentMethodId: pm.id,
        type: "sepa_debit",
        brand: "sepa_debit",
        last4: pm.sepa_debit?.last4 ?? undefined,
      };
    }
    return {
      paymentMethodId: pm.id,
      type: "card",
      brand: pm.card?.brand ?? undefined,
      last4: pm.card?.last4 ?? undefined,
    };
  }

  async createConnectedCustomer(input: {
    participantId: string;
    stripeAccountId: string;
  }): Promise<{ stripeCustomerId: string }> {
    // INT-355 / NFR-015 — identifiers only; Stripe never receives the consumer's name or e-mail here.
    const customer = await this.stripe.customers.create(
      { metadata: { participantId: input.participantId } },
      { stripeAccount: input.stripeAccountId },
    );
    return { stripeCustomerId: customer.id };
  }

  /**
   * INT-355 / REQ-014 / TD-6 — direct charge: the consumer pays the producer's
   * Stripe invoice on the producer Connect account, so funds never sit on the
   * platform balance (no transfer_data). Stripe allows one payment per invoice,
   * which rules out a second charge for the same invoice.
   */
  async createPayment(input: PspPaymentInput): Promise<PspPaymentResult> {
    const opts: Stripe.RequestOptions = { stripeAccount: input.producerStripeAccountId };
    try {
      const invoice = await this.stripe.invoices.retrieve(
        input.stripeInvoiceId,
        { expand: ["payments"] },
        opts,
      );
      if (invoice.status === "paid") {
        return { stripePaymentId: invoicePaymentIntentId(invoice), status: "succeeded" };
      }
      if (invoice.status !== "open") {
        return {
          stripePaymentId: invoicePaymentIntentId(invoice),
          status: "failed",
          failureCategory: "invoice_not_payable",
        };
      }
      if (
        invoice.amount_due !== toMinorUnits(input.amount) ||
        invoice.currency !== input.currency.toLowerCase()
      ) {
        return {
          stripePaymentId: invoicePaymentIntentId(invoice),
          status: "failed",
          failureCategory: "amount_mismatch",
        };
      }

      const platformPm = await this.stripe.paymentMethods.retrieve(
        input.consumerPaymentMethodId,
      );
      // Stripe refuses to share sepa_debit PaymentMethods with a connected
      // account, so a platform SEPA mandate cannot fund a direct charge.
      if (platformPm.type === "sepa_debit") {
        return {
          stripePaymentId: invoicePaymentIntentId(invoice),
          status: "failed",
          failureCategory: "sepa_debit_not_shareable",
        };
      }
      // INT-363 — pm_card_visa (UAT seed) is a reusable token with no Customer.
      // Stripe clones a card onto a connected account only after it belongs to
      // a platform Customer.
      const shareable = await this.shareablePlatformCard(
        platformPm,
        input.consumerPaymentMethodId,
      );
      if (!shareable) {
        return {
          stripePaymentId: invoicePaymentIntentId(invoice),
          status: "failed",
          failureCategory: "payment_method_not_attached",
        };
      }
      // Stripe master (TP-7): pay as the invoice's own customer; the mapped
      // customer only differs for invoices issued before INT-355.
      const customer = stripeId(invoice.customer) ?? input.connectedCustomerId;
      const cloned = await this.stripe.paymentMethods.create(
        { customer: shareable.customerId, payment_method: shareable.id },
        opts,
      );
      await this.stripe.paymentMethods.attach(cloned.id, { customer }, opts);

      // The charge copies PaymentIntent metadata: keep the AC-06 invoice id on the
      // producer-side charge for reconciliation (identifier only, NFR-015).
      const intentId = invoicePaymentIntentId(invoice);
      if (intentId.startsWith("pi_")) {
        await this.stripe.paymentIntents.update(
          intentId,
          { metadata: { invoiceId: input.invoiceId } },
          opts,
        );
      }

      const paid = await this.stripe.invoices.pay(
        invoice.id,
        { payment_method: cloned.id, off_session: true, expand: ["payments"] },
        opts,
      );
      // INT-367 — pay creates the PaymentIntent. Tag it and the charge afterwards:
      // a metadata update on the PaymentIntent does not copy onto a charge that
      // already exists, and the e2e assertion finds the charge by invoiceId.
      await this.tagProducerCharge(paid, input.invoiceId, opts);
      const stripePaymentId = invoicePaymentIntentId(paid);
      if (paid.status === "paid") {
        return { stripePaymentId, status: "succeeded" };
      }
      // Still open (e.g. processing / requires_action): invoice.paid or
      // invoice.payment_failed on the Connect endpoint closes it.
      if (paid.status === "open") {
        return { stripePaymentId, status: "pending" };
      }
      return { stripePaymentId, status: "failed", failureCategory: "declined" };
    } catch (err) {
      const stripeErr = err as {
        decline_code?: string;
        code?: string;
        message?: string;
        payment_intent?: { id?: string };
      };
      const code =
        stripeErr.decline_code ??
        stripeErr.code ??
        (typeof stripeErr.message === "string" ? stripeErr.message.slice(0, 64) : "declined");
      return {
        stripePaymentId: stripeErr.payment_intent?.id ?? input.stripeInvoiceId,
        status: "failed",
        failureCategory: mapFailureCategory(String(code)),
      };
    }
  }

  /**
   * INT-367 — write the AC-06 invoice id onto the producer charge.
   * A new invoice has no PaymentIntent until `invoices.pay`, so the pre-pay
   * update never runs. The charge is created during pay and does not inherit
   * a later PaymentIntent metadata change.
   */
  private async tagProducerCharge(
    invoice: Stripe.Invoice,
    invoiceId: string,
    opts: Stripe.RequestOptions,
  ): Promise<void> {
    const intentId = invoicePaymentIntentId(invoice);
    if (!intentId.startsWith("pi_")) return;
    const intent = await this.stripe.paymentIntents.update(
      intentId,
      { metadata: { invoiceId } },
      opts,
    );
    const chargeId = stripeId(intent?.latest_charge);
    if (!chargeId) return;
    await this.stripe.charges.update(chargeId, { metadata: { invoiceId } }, opts);
  }

  async refund(stripePaymentId: string): Promise<{ status: "refunded" }> {
    await this.stripe.refunds.create({ payment_intent: stripePaymentId });
    return { status: "refunded" };
  }

  verifyWebhook(rawBody: string, signature: string): WebhookVerification {
    if (this.webhookSecrets.length === 0) {
      return { ok: false };
    }
    let event: Stripe.Event | undefined;
    for (const secret of this.webhookSecrets) {
      try {
        event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
        break;
      } catch {
        // try next secret (platform vs Connect endpoint)
      }
    }
    if (!event) {
      return { ok: false };
    }
    return normalizeStripeEvent(event);
  }
}

function hasTokenizableKyc(submission: OnboardingRequirementsSubmission): boolean {
  return Boolean(
    submission.tosAccepted ||
      submission.businessType ||
      submission.representative?.firstName ||
      submission.representative?.lastName ||
      submission.representative?.email,
  );
}

function normalizeStripeEvent(event: Stripe.Event): WebhookVerification {
  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    return {
      ok: true,
      eventId: event.id,
      eventType: event.type,
      payload: {
        participantId: account.metadata?.participantId,
        stripeAccountId: account.id,
      },
    };
  }
  if (
    event.type === "payment_intent.succeeded" ||
    event.type === "payment_intent.payment_failed"
  ) {
    const intent = event.data.object as Stripe.PaymentIntent;
    return {
      ok: true,
      eventId: event.id,
      eventType: event.type,
      payload: {
        stripePaymentId: intent.id,
        status: intent.status,
        ...connectAccount(event),
        ...(intent.last_payment_error
          ? {
              failureCategory: mapFailureCategory(
                intent.last_payment_error.decline_code ??
                  intent.last_payment_error.code ??
                  "declined",
              ),
            }
          : {}),
      },
    };
  }
  // INT-355 — the invoice is paid on the producer Connect account (Connect endpoint).
  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    return {
      ok: true,
      eventId: event.id,
      eventType: event.type,
      payload: {
        stripeInvoiceId: invoice.id,
        status: invoice.status,
        ...connectAccount(event),
      },
    };
  }
  return {
    ok: true,
    eventId: event.id,
    eventType: event.type,
    payload: event.data.object as unknown as Record<string, unknown>,
  };
}

function connectAccount(event: Stripe.Event): { stripeAccountId?: string } {
  return event.account ? { stripeAccountId: event.account } : {};
}

function stripeId(ref: string | { id: string } | null | undefined): string | undefined {
  if (!ref) return undefined;
  return typeof ref === "string" ? ref : ref.id;
}

/** PaymentIntent behind the invoice (API ≥ basil exposes it through invoice.payments). */
function invoicePaymentIntentId(invoice: Stripe.Invoice): string {
  const payments = invoice.payments?.data ?? [];
  const chosen = payments.find((p) => p.is_default) ?? payments[0];
  return stripeId(chosen?.payment.payment_intent) ?? invoice.id;
}

function mapFailureCategory(code: string): string {
  const lower = code.toLowerCase();
  if (lower.includes("insufficient")) return "insufficient_funds";
  if (lower.includes("authenticat")) return "authentication_required";
  return "declined";
}

function sessionFromAccount(account: Stripe.Account): OnboardingSession {
  const currentlyDue = account.requirements?.currently_due ?? [];
  const pending = account.requirements?.pending_verification ?? [];
  let status: OnboardingSession["status"] = "requirements_due";
  if (currentlyDue.length === 0 && pending.length > 0) {
    status = "pending_verification";
  } else if (currentlyDue.length === 0 && (account.details_submitted || account.charges_enabled)) {
    status = "complete";
  }
  return {
    mode: "requirements",
    status,
    stripeAccountId: account.id,
    currentlyDue: [...currentlyDue],
    eventuallyDue: [...(account.requirements?.eventually_due ?? [])],
  };
}
