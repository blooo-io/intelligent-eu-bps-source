import Stripe from "stripe";
import type {
  OnboardingLink,
  PaymentMethodRef,
  ProducerAccount,
  PspPaymentResult,
  PspPort,
  WebhookVerification,
} from "./psp.port.js";
import { readStripeEnv, toMinorUnits, type StripeEnv } from "./stripe-env.js";

/**
 * Real Stripe test-mode P-PSP adapter (INT-189 / AD-6 / BR-12).
 * Destination charges to the producer Connect account (TD-6).
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

  async createProducerAccount(participantId: string): Promise<ProducerAccount> {
    // Controller properties (Accounts v1) — Express-style dashboard for producers.
    const account = await this.stripe.accounts.create({
      controller: {
        stripe_dashboard: { type: "express" },
        fees: { payer: "application" },
        losses: { payments: "application" },
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { participantId },
    });
    return { stripeAccountId: account.id };
  }

  async onboardingLink(
    stripeAccountId: string,
    returnUrl: string,
  ): Promise<OnboardingLink> {
    const link = await this.stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: returnUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });
    return { url: link.url };
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
