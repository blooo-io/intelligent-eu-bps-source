import Stripe from "stripe";
import type {
  ChargeSettlement,
  CheckoutInput,
  CheckoutSession,
  CollectPort,
  CollectResult,
  DirectChargeInput,
  PaymentMethodDetails as CollectPaymentMethodDetails,
} from "./collect.port.js";
import type {
  KycOnboardingPort,
  OnboardingSession as KycOnboardingSession,
  PspAccountStatus,
} from "./kyc-onboarding.port.js";
import type { PayoutPort, PayoutResult } from "./payout.port.js";
import type { PspEventsPort, PspEventVerification } from "./psp-events.port.js";
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
import {
  PspError,
  type PspEvent,
  type PspFailureCategory,
  type PspPaymentMethodType,
} from "./psp.types.js";
import { readStripeEnv, toMinorUnits, type StripeEnv } from "./stripe-env.js";

/**
 * Real Stripe test-mode P-PSP adapter (INT-189 / INT-190 / INT-191 / AD-6 / BR-12).
 * Implements neutral ports (WS5 Tasks 5.4–5.5 / INT-424) and keeps legacy
 * {@link PspPort} methods until Task 5.6 deletes the old port.
 *
 * Direct charges (neutral): PaymentIntent confirm off_session on the producer
 * Connect account (REQ-014 / TD-6). Legacy {@link createPayment} still pays the
 * producer's Stripe invoice until Task 5.7 rewires the service.
 */
export class StripePspAdapter
  implements KycOnboardingPort, CollectPort, PayoutPort, PspEventsPort, PspPort
{
  private readonly stripe: Stripe;
  private readonly webhookSecrets: string[];

  constructor(
    creds: StripeEnv = readStripeEnv()!,
    /** Test seam — inject {@link createFakeStripe} (WS5 Task 5.4). */
    stripeClient?: Stripe,
  ) {
    if (!creds?.secretKey) {
      throw new Error("StripePspAdapter requires stripe_secret_key");
    }
    // BR-12 — test-mode secret only (sk_test_ / rk_test_).
    if (!/_test_/.test(creds.secretKey)) {
      throw new Error("StripePspAdapter refuses non-test API keys (BR-12)");
    }
    this.stripe = stripeClient ?? new Stripe(creds.secretKey);
    this.webhookSecrets = [creds.webhookSecret, creds.connectWebhookSecret].filter(
      (s) => s.length > 0,
    );
  }

  // ── Neutral: KycOnboardingPort ──────────────────────────────────────────

  async createConnectedAccount(input: {
    participantId: string;
    country: string;
  }): Promise<{ pspAccountRef: string }> {
    // INT-362 controller — fees/disputes on the producer; Stripe collects KYC.
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
        sepa_debit_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { participantId: input.participantId },
    });
    return { pspAccountRef: account.id };
  }

  async createOnboardingSession(input: {
    pspAccountRef: string;
    mode: "hosted" | "embedded";
    returnUrl?: string;
    refreshUrl?: string;
  }): Promise<KycOnboardingSession> {
    if (input.mode === "hosted") {
      const link = await this.stripe.accountLinks.create({
        account: input.pspAccountRef,
        type: "account_onboarding",
        return_url: input.returnUrl ?? "https://app.invalid/return",
        refresh_url: input.refreshUrl ?? "https://app.invalid/refresh",
      });
      return {
        pspAccountRef: input.pspAccountRef,
        mode: "hosted",
        onboardingUrl: link.url,
        expiresAt: new Date(link.expires_at * 1000).toISOString(),
      };
    }
    const session = await this.stripe.accountSessions.create({
      account: input.pspAccountRef,
      components: { account_onboarding: { enabled: true } },
    });
    const expiresAt = session.expires_at
      ? new Date(session.expires_at * 1000).toISOString()
      : new Date(Date.now() + 60 * 60 * 1000).toISOString();
    return {
      pspAccountRef: input.pspAccountRef,
      mode: "embedded",
      clientSecret: session.client_secret,
      expiresAt,
    };
  }

  async getAccountStatus(pspAccountRef: string): Promise<PspAccountStatus> {
    const account = await this.stripe.accounts.retrieve(pspAccountRef);
    const currentlyDue = account.requirements?.currently_due ?? [];
    const pending = account.requirements?.pending_verification ?? [];
    let status: PspAccountStatus["status"] = "requirements_due";
    if (currentlyDue.length === 0 && pending.length > 0) {
      status = "pending_verification";
    } else if (
      currentlyDue.length === 0 &&
      (account.details_submitted || account.charges_enabled)
    ) {
      status = "complete";
    }
    return {
      pspAccountRef,
      status,
      currentlyDue: [...currentlyDue],
      chargesEnabled: Boolean(account.charges_enabled),
      payoutsEnabled: Boolean(account.payouts_enabled),
    };
  }

  // ── Neutral: CollectPort ────────────────────────────────────────────────

  async createPaymentMethodSetup(
    participantId: string,
  ): Promise<{ clientSecret: string }> {
    return this.createSetupIntent(participantId);
  }

  async attachPaymentMethod(
    participantId: string,
    paymentMethodId: string,
  ): Promise<PaymentMethodRef & { pspPaymentMethodRef: string }> {
    const pm = await this.stripe.paymentMethods.retrieve(paymentMethodId);
    const customerId =
      typeof pm.customer === "string" ? pm.customer : pm.customer?.id;
    // INT-363 — a reusable test token has no Customer and stays attachable.
    // A PaymentMethod already on a Customer must belong to this participant.
    if (customerId) {
      const customer = await this.stripe.customers.retrieve(customerId);
      const owner =
        "metadata" in customer ? customer.metadata?.participantId : undefined;
      if (owner !== participantId) {
        throw new Error("payment_method_owned_by_other");
      }
    }
    return { paymentMethodId: pm.id, pspPaymentMethodRef: pm.id };
  }

  async getPaymentMethodDetails(
    paymentMethodId: string,
  ): Promise<PaymentMethodDetails & CollectPaymentMethodDetails> {
    const pm = await this.stripe.paymentMethods.retrieve(paymentMethodId);
    const type = pm.type ?? "card";
    if (type === "sepa_debit") {
      return {
        paymentMethodId: pm.id,
        pspPaymentMethodRef: pm.id,
        type: "sepa_debit",
        brand: "sepa_debit",
        last4: pm.sepa_debit?.last4 ?? undefined,
      };
    }
    return {
      paymentMethodId: pm.id,
      pspPaymentMethodRef: pm.id,
      type: "card",
      brand: pm.card?.brand ?? undefined,
      last4: pm.card?.last4 ?? undefined,
    };
  }

  async ensureCustomer(input: {
    participantId: string;
    pspAccountRef: string;
  }): Promise<{ pspCustomerRef: string }> {
    // INT-355 / NFR-015 — identifiers only; no personal data.
    const customer = await this.stripe.customers.create(
      { metadata: { participantId: input.participantId } },
      { stripeAccount: input.pspAccountRef },
    );
    return { pspCustomerRef: customer.id };
  }

  /**
   * REQ-014 — direct charge: clone the platform card PM onto the connected
   * account, then confirm a PaymentIntent off_session (A6 — no Stripe Invoice).
   * Platform sepa_debit PMs cannot be shared → mandate_invalid (use checkout).
   */
  async createDirectCharge(input: DirectChargeInput): Promise<CollectResult> {
    const opts: Stripe.RequestOptions = {
      stripeAccount: input.pspAccountRef,
      idempotencyKey: input.idempotencyKey,
    };
    try {
      const platformPm = await this.stripe.paymentMethods.retrieve(
        input.pspPaymentMethodRef,
      );
      if (platformPm.type === "sepa_debit") {
        return {
          pspPaymentRef: input.pspPaymentMethodRef,
          status: "failed",
          method: "sepa_debit",
          failureCategory: "mandate_invalid",
        };
      }

      const shareable = await this.shareablePlatformCard(
        platformPm,
        input.pspPaymentMethodRef,
      );
      if (!shareable) {
        return {
          pspPaymentRef: input.pspPaymentMethodRef,
          status: "failed",
          method: "card",
          failureCategory: "other",
        };
      }

      const cloned = await this.stripe.paymentMethods.create(
        { customer: shareable.customerId, payment_method: shareable.id },
        { stripeAccount: input.pspAccountRef },
      );
      await this.stripe.paymentMethods.attach(
        cloned.id,
        { customer: input.pspCustomerRef },
        { stripeAccount: input.pspAccountRef },
      );

      const intent = await this.stripe.paymentIntents.create(
        {
          amount: toMinorUnits(input.amount),
          currency: input.currency.toLowerCase(),
          customer: input.pspCustomerRef,
          payment_method: cloned.id,
          confirm: true,
          off_session: true,
          metadata: { invoiceId: input.invoiceId },
        },
        opts,
      );

      return {
        pspPaymentRef: intent.id,
        status: mapPaymentIntentStatus(intent.status),
        method: "card",
        ...(intent.status === "requires_payment_method" ||
        intent.status === "canceled"
          ? {
              failureCategory: toPspFailureCategory(
                intent.last_payment_error?.decline_code ??
                  intent.last_payment_error?.code ??
                  "generic_decline",
              ),
            }
          : {}),
      };
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
        (typeof stripeErr.message === "string"
          ? stripeErr.message.slice(0, 64)
          : "generic_decline");
      return {
        pspPaymentRef:
          stripeErr.payment_intent?.id ?? input.pspPaymentMethodRef,
        status: "failed",
        method: "card",
        failureCategory: toPspFailureCategory(String(code)),
      };
    }
  }

  async createCheckoutSession(input: CheckoutInput): Promise<CheckoutSession> {
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: "payment",
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        customer: input.pspCustomerRef,
        // Stripe SDK 23 — SessionCreateParams uses allowed_payment_method_types
        // (payment_method_types was removed from create params).
        allowed_payment_method_types: input.methods,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: toMinorUnits(input.amount),
              // NFR-015 — product name is the invoice id only; no personal data.
              product_data: { name: `Invoice ${input.invoiceId}` },
            },
          },
        ],
        payment_intent_data: {
          metadata: { invoiceId: input.invoiceId },
          ...(input.saveForFutureUse
            ? { setup_future_usage: "off_session" as const }
            : {}),
        },
      },
      {
        stripeAccount: input.pspAccountRef,
        idempotencyKey: input.idempotencyKey,
      },
    );
    if (!session.url) {
      throw new Error("Checkout Session missing url");
    }
    const expiresAt = session.expires_at
      ? new Date(session.expires_at * 1000).toISOString()
      : new Date(Date.now() + 60 * 60 * 1000).toISOString();
    return {
      pspCheckoutRef: session.id,
      checkoutUrl: session.url,
      expiresAt,
    };
  }

  async getChargeSettlement(input: {
    pspPaymentRef: string;
    pspAccountRef: string;
  }): Promise<ChargeSettlement | null> {
    const intent = await this.stripe.paymentIntents.retrieve(
      input.pspPaymentRef,
      { expand: ["latest_charge.balance_transaction"] },
      { stripeAccount: input.pspAccountRef },
    );
    const charge = intent.latest_charge;
    if (!charge || typeof charge === "string") return null;
    const txn = charge.balance_transaction;
    if (!txn || typeof txn === "string") return null;

    const feeMinor = txn.fee;
    const currency = (txn.currency ?? intent.currency).toUpperCase();
    const methodType =
      charge.payment_method_details?.type === "sepa_debit"
        ? "sepa_debit"
        : "card";
    const method: PspPaymentMethodType =
      methodType === "sepa_debit" ? "sepa_debit" : "card";

    return {
      method,
      feeAmount: fromMinorUnits(feeMinor),
      feeCurrency: currency,
      ...(typeof txn.available_on === "number"
        ? {
            fundsAvailableAt: new Date(txn.available_on * 1000).toISOString(),
          }
        : {}),
    };
  }

  async refund(
    arg: string | { pspPaymentRef: string; pspAccountRef: string },
  ): Promise<{ status: "refunded" }> {
    if (typeof arg === "string") {
      await this.stripe.refunds.create({ payment_intent: arg });
      return { status: "refunded" };
    }
    await this.stripe.refunds.create(
      { payment_intent: arg.pspPaymentRef },
      { stripeAccount: arg.pspAccountRef },
    );
    return { status: "refunded" };
  }

  // ── Neutral: PayoutPort ─────────────────────────────────────────────────

  async setManualSchedule(accountRef: string): Promise<void> {
    await this.stripe.accounts.update(accountRef, {
      settings: { payouts: { schedule: { interval: "manual" } } },
    });
  }

  async getAvailableBalance(
    accountRef: string,
    currency: string,
  ): Promise<{ amount: string; currency: string }> {
    const balance = await this.stripe.balance.retrieve(
      {},
      { stripeAccount: accountRef },
    );
    const cur = currency.toLowerCase();
    const available = (balance.available ?? []).find(
      (b) => b.currency === cur,
    );
    return {
      amount: fromMinorUnits(available?.amount ?? 0),
      currency: currency.toUpperCase(),
    };
  }

  async createPayout(
    accountRef: string,
    amount: string,
    currency: string,
    idempotencyKey: string,
  ): Promise<PayoutResult> {
    try {
      const payout = await this.stripe.payouts.create(
        {
          amount: toMinorUnits(amount),
          currency: currency.toLowerCase(),
          metadata: {},
        },
        { stripeAccount: accountRef, idempotencyKey },
      );
      return {
        pspPayoutRef: payout.id,
        status: mapPayoutStatus(payout.status),
        ...(typeof payout.arrival_date === "number"
          ? {
              arrivalDate: new Date(payout.arrival_date * 1000)
                .toISOString()
                .slice(0, 10),
            }
          : {}),
      };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "balance_insufficient") {
        throw new PspError(
          "insufficient_balance",
          `Stripe balance_insufficient for ${amount} ${currency}`,
        );
      }
      throw err;
    }
  }

  // ── Neutral: PspEventsPort ──────────────────────────────────────────────

  verifyEvent(rawBody: string, signature: string): PspEventVerification {
    const event = this.constructStripeEvent(rawBody, signature);
    if (!event) return { ok: false };
    return { ok: true, event: normalizeStripeEvent(event) };
  }

  // ── Legacy PspPort (kept until Task 5.6) ────────────────────────────────

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
    if (
      submission.externalAccount?.accountNumber &&
      submission.externalAccount.country
    ) {
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

  async createConnectedCustomer(input: {
    participantId: string;
    stripeAccountId: string;
  }): Promise<{ stripeCustomerId: string }> {
    const { pspCustomerRef } = await this.ensureCustomer({
      participantId: input.participantId,
      pspAccountRef: input.stripeAccountId,
    });
    return { stripeCustomerId: pspCustomerRef };
  }

  /**
   * INT-355 / REQ-014 / TD-6 — legacy direct charge via Stripe Invoice.
   * Kept until Task 5.7 rewires payments.service to CollectPort.
   */
  async createPayment(input: PspPaymentInput): Promise<PspPaymentResult> {
    const opts: Stripe.RequestOptions = {
      stripeAccount: input.producerStripeAccountId,
    };
    try {
      const invoice = await this.stripe.invoices.retrieve(
        input.stripeInvoiceId,
        { expand: ["payments"] },
        opts,
      );
      if (invoice.status === "paid") {
        return {
          stripePaymentId: invoicePaymentIntentId(invoice),
          status: "succeeded",
        };
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
      if (platformPm.type === "sepa_debit") {
        return {
          stripePaymentId: invoicePaymentIntentId(invoice),
          status: "failed",
          failureCategory: "sepa_debit_not_shareable",
        };
      }
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
      const customer = stripeId(invoice.customer) ?? input.connectedCustomerId;
      const cloned = await this.stripe.paymentMethods.create(
        { customer: shareable.customerId, payment_method: shareable.id },
        opts,
      );
      await this.stripe.paymentMethods.attach(cloned.id, { customer }, opts);

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
        { ...opts, idempotencyKey: `pay:${input.invoiceId}` },
      );
      await this.tagProducerCharge(paid, input.invoiceId, opts);
      const stripePaymentId = invoicePaymentIntentId(paid);
      if (paid.status === "paid") {
        return { stripePaymentId, status: "succeeded" };
      }
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
        (typeof stripeErr.message === "string"
          ? stripeErr.message.slice(0, 64)
          : "declined");
      return {
        stripePaymentId: stripeErr.payment_intent?.id ?? input.stripeInvoiceId,
        status: "failed",
        failureCategory: legacyMapFailureCategory(String(code)),
      };
    }
  }

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

  verifyWebhook(rawBody: string, signature: string): WebhookVerification {
    const event = this.constructStripeEvent(rawBody, signature);
    if (!event) return { ok: false };
    return legacyNormalizeStripeEvent(event);
  }

  private constructStripeEvent(
    rawBody: string,
    signature: string,
  ): Stripe.Event | undefined {
    if (this.webhookSecrets.length === 0) return undefined;
    for (const secret of this.webhookSecrets) {
      try {
        return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
      } catch {
        // try next secret (platform vs Connect endpoint)
      }
    }
    return undefined;
  }
}

// ── Exported pure mappers (WS5 Task 5.5) ──────────────────────────────────

const DECLINE_CODE_MAP: Record<string, PspFailureCategory> = {
  generic_decline: "card_declined",
  do_not_honor: "card_declined",
  card_declined: "card_declined",
  insufficient_funds: "insufficient_funds",
  authentication_required: "authentication_required",
  debit_not_authorized: "mandate_invalid",
  account_closed: "bank_account_invalid",
  no_account: "bank_account_invalid",
  processing_error: "provider_error",
};

/** Map a Stripe decline / error code to the canonical {@link PspFailureCategory}. */
export function toPspFailureCategory(code: string): PspFailureCategory {
  const lower = code.toLowerCase();
  const mapped = DECLINE_CODE_MAP[lower];
  if (mapped) return mapped;
  if (lower.includes("insufficient")) return "insufficient_funds";
  if (lower.includes("authenticat")) return "authentication_required";
  return "other";
}

/** Normalize a verified Stripe Event into a PSP-neutral {@link PspEvent}. */
export function normalizeStripeEvent(event: Stripe.Event): PspEvent {
  const occurredAt = new Date(event.created * 1000).toISOString();
  const base = {
    eventId: event.id,
    occurredAt,
    pspAccountRef: event.account,
  };

  switch (event.type) {
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      return {
        ...base,
        kind: "account.updated",
        pspAccountRef: account.id,
        participantId: account.metadata?.participantId,
      };
    }
    case "payment_intent.processing": {
      const intent = event.data.object as Stripe.PaymentIntent;
      return {
        ...base,
        kind: "payment.processing",
        pspPaymentRef: intent.id,
        invoiceId: intent.metadata?.invoiceId,
        method: methodFromIntent(intent),
      };
    }
    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      return {
        ...base,
        kind: "payment.succeeded",
        pspPaymentRef: intent.id,
        invoiceId: intent.metadata?.invoiceId,
        method: methodFromIntent(intent),
      };
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const code =
        intent.last_payment_error?.decline_code ??
        intent.last_payment_error?.code ??
        "generic_decline";
      return {
        ...base,
        kind: "payment.failed",
        pspPaymentRef: intent.id,
        invoiceId: intent.metadata?.invoiceId,
        method: methodFromIntent(intent),
        failureCategory: toPspFailureCategory(code),
      };
    }
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      return {
        ...base,
        kind: "checkout.completed",
        pspCheckoutRef: session.id,
        pspPaymentRef: stripeId(session.payment_intent),
        invoiceId:
          session.metadata?.invoiceId ??
          (typeof session.payment_intent === "object" &&
          session.payment_intent &&
          "metadata" in session.payment_intent
            ? session.payment_intent.metadata?.invoiceId
            : undefined),
      };
    }
    case "payout.paid": {
      const payout = event.data.object as Stripe.Payout;
      return {
        ...base,
        kind: "payout.paid",
        pspPayoutRef: payout.id,
      };
    }
    case "payout.failed": {
      const payout = event.data.object as Stripe.Payout;
      return {
        ...base,
        kind: "payout.failed",
        pspPayoutRef: payout.id,
        failureCategory: toPspFailureCategory(
          payout.failure_code ?? "processing_error",
        ),
      };
    }
    case "payout.canceled": {
      const payout = event.data.object as Stripe.Payout;
      return {
        ...base,
        kind: "payout.canceled",
        pspPayoutRef: payout.id,
      };
    }
    default:
      return { ...base, kind: "ignored" };
  }
}

// ── Internals ─────────────────────────────────────────────────────────────

function methodFromIntent(
  intent: Stripe.PaymentIntent,
): PspPaymentMethodType | undefined {
  const types = intent.payment_method_types ?? [];
  if (types.includes("sepa_debit")) return "sepa_debit";
  if (types.includes("card")) return "card";
  return undefined;
}

function mapPaymentIntentStatus(
  status: string,
): CollectResult["status"] {
  if (status === "succeeded") return "succeeded";
  if (
    status === "processing" ||
    status === "requires_action" ||
    status === "requires_capture"
  ) {
    return "pending";
  }
  return "failed";
}

function mapPayoutStatus(status: string | null): PayoutResult["status"] {
  switch (status) {
    case "paid":
      return "paid";
    case "in_transit":
      return "in_transit";
    case "canceled":
      return "canceled";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

function fromMinorUnits(minor: number): string {
  return (minor / 100).toFixed(2);
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

/** Legacy webhook shape for payments.service until Task 5.8. */
function legacyNormalizeStripeEvent(event: Stripe.Event): WebhookVerification {
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
        ...(event.account ? { stripeAccountId: event.account } : {}),
        ...(intent.last_payment_error
          ? {
              failureCategory: legacyMapFailureCategory(
                intent.last_payment_error.decline_code ??
                  intent.last_payment_error.code ??
                  "declined",
              ),
            }
          : {}),
      },
    };
  }
  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    return {
      ok: true,
      eventId: event.id,
      eventType: event.type,
      payload: {
        stripeInvoiceId: invoice.id,
        status: invoice.status,
        ...(event.account ? { stripeAccountId: event.account } : {}),
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

function legacyMapFailureCategory(code: string): string {
  const lower = code.toLowerCase();
  if (lower.includes("insufficient")) return "insufficient_funds";
  if (lower.includes("authenticat")) return "authentication_required";
  return "declined";
}

function stripeId(
  ref: string | { id: string } | null | undefined,
): string | undefined {
  if (!ref) return undefined;
  return typeof ref === "string" ? ref : ref.id;
}

/** PaymentIntent behind the invoice (API ≥ basil exposes it through invoice.payments). */
function invoicePaymentIntentId(invoice: Stripe.Invoice): string {
  const payments = invoice.payments?.data ?? [];
  const chosen = payments.find((p) => p.is_default) ?? payments[0];
  return stripeId(chosen?.payment.payment_intent) ?? invoice.id;
}

function sessionFromAccount(account: Stripe.Account): OnboardingSession {
  const currentlyDue = account.requirements?.currently_due ?? [];
  const pending = account.requirements?.pending_verification ?? [];
  let status: OnboardingSession["status"] = "requirements_due";
  if (currentlyDue.length === 0 && pending.length > 0) {
    status = "pending_verification";
  } else if (
    currentlyDue.length === 0 &&
    (account.details_submitted || account.charges_enabled)
  ) {
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
