import Stripe from "stripe";
import type {
  CreateProducerAccountInput,
  OnboardingRequirementsSubmission,
  OnboardingSession,
  PaymentMethodDetails,
  PaymentMethodRef,
  ProducerAccount,
  PspPaymentResult,
  PspPort,
  WebhookVerification,
} from "./psp.port.js";
import { readStripeEnv, toMinorUnits, type StripeEnv } from "./stripe-env.js";

/**
 * Real Stripe test-mode P-PSP adapter (INT-189 / INT-190 / INT-191 / AD-6 / BR-12).
 * Destination charges to the producer Connect account (TD-6).
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

  async getAccountSession(stripeAccountId: string): Promise<OnboardingSession> {
    const account = await this.stripe.accounts.retrieve(stripeAccountId);
    return sessionFromAccount(account);
  }

  async submitAccountRequirements(
    stripeAccountId: string,
    submission: OnboardingRequirementsSubmission,
    clientIp: string,
  ): Promise<OnboardingSession> {
    void clientIp;
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
    const intent = await this.stripe.setupIntents.create({
      customer: customer.id,
      usage: "off_session",
      automatic_payment_methods: { enabled: true },
      metadata: { participantId },
    });
    if (!intent.client_secret) {
      throw new Error("SetupIntent missing client_secret");
    }
    return { clientSecret: intent.client_secret };
  }

  async attachPaymentMethod(
    participantId: string,
    paymentMethodId: string,
  ): Promise<PaymentMethodRef> {
    // Validate the PaymentMethod exists in test mode; attachment to a Customer
    // is deferred until pay time if the PM is already platform-scoped.
    const pm = await this.stripe.paymentMethods.retrieve(paymentMethodId);
    void participantId;
    return { paymentMethodId: pm.id };
  }

  async getPaymentMethodDetails(
    paymentMethodId: string,
  ): Promise<PaymentMethodDetails> {
    const pm = await this.stripe.paymentMethods.retrieve(paymentMethodId);
    return {
      paymentMethodId: pm.id,
      brand: pm.card?.brand ?? undefined,
      last4: pm.card?.last4 ?? undefined,
    };
  }

  async createPayment(input: {
    invoiceId: string;
    amount: string;
    currency: string;
    producerStripeAccountId: string;
    consumerPaymentMethodId: string;
  }): Promise<PspPaymentResult> {
    try {
      const intent = await this.stripe.paymentIntents.create({
        amount: toMinorUnits(input.amount),
        currency: input.currency.toLowerCase(),
        payment_method: input.consumerPaymentMethodId,
        confirm: true,
        off_session: true,
        transfer_data: { destination: input.producerStripeAccountId },
        metadata: { invoiceId: input.invoiceId },
      });
      if (intent.status === "succeeded") {
        return { stripePaymentId: intent.id, status: "succeeded" };
      }
      if (intent.status === "requires_action" || intent.status === "processing") {
        return { stripePaymentId: intent.id, status: "pending" };
      }
      return {
        stripePaymentId: intent.id,
        status: "failed",
        failureCategory: intent.last_payment_error?.code ?? "declined",
      };
    } catch (err) {
      const stripeErr = err as {
        decline_code?: string;
        code?: string;
        message?: string;
      };
      const code =
        stripeErr.decline_code ??
        stripeErr.code ??
        (typeof stripeErr.message === "string" ? stripeErr.message.slice(0, 64) : "declined");
      return {
        stripePaymentId: `pi_failed_${Date.now()}`,
        status: "failed",
        failureCategory: mapFailureCategory(String(code)),
      };
    }
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
      eventType: event.type,
      payload: {
        stripePaymentId: intent.id,
        status: intent.status,
      },
    };
  }
  return {
    ok: true,
    eventType: event.type,
    payload: event.data.object as unknown as Record<string, unknown>,
  };
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
