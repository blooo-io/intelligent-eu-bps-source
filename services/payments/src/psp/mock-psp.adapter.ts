import { createHmac, randomUUID } from "node:crypto";
import type {
  OnboardingRequirementsSubmission,
  OnboardingSession,
  PaymentMethodRef,
  ProducerAccount,
  PspPaymentResult,
  PspPort,
  WebhookVerification,
} from "./psp.port.js";

const TEST_SECRET = "whsec_test_intelligent";

/**
 * Stripe test-mode stand-in (BR-12). No network; signatures use a local HMAC.
 * S10-style card failure can be forced via paymentMethodId prefix `pm_fail_`.
 */
export class MockPspAdapter implements PspPort {
  readonly accounts = new Map<string, string>();
  readonly methods = new Map<string, string>();
  readonly payments: PspPaymentResult[] = [];
  readonly dueByAccount = new Map<string, string[]>();

  async createProducerAccount(participantId: string): Promise<ProducerAccount> {
    const stripeAccountId = `acct_test_${participantId.replace(/-/g, "").slice(0, 16)}`;
    this.accounts.set(participantId, stripeAccountId);
    this.dueByAccount.set(stripeAccountId, [
      "business_type",
      "business_profile.url",
      "business_profile.mcc",
      "representative.first_name",
      "representative.last_name",
      "representative.email",
      "external_account",
      "tos_acceptance.date",
    ]);
    return { stripeAccountId };
  }

  async getAccountSession(stripeAccountId: string): Promise<OnboardingSession> {
    const due = this.dueByAccount.get(stripeAccountId) ?? [];
    return {
      mode: "requirements",
      status: due.length === 0 ? "complete" : "requirements_due",
      stripeAccountId,
      currentlyDue: [...due],
      eventuallyDue: [],
    };
  }

  async submitAccountRequirements(
    stripeAccountId: string,
    submission: OnboardingRequirementsSubmission,
    clientIp: string,
  ): Promise<OnboardingSession> {
    void clientIp;
    // Mock: a complete-looking payload clears all due keys (unit stand-in for Stripe).
    const complete =
      Boolean(submission.businessType) &&
      Boolean(submission.businessProfileUrl) &&
      Boolean(submission.businessProfileMcc) &&
      Boolean(submission.representative?.firstName) &&
      Boolean(submission.representative?.lastName) &&
      Boolean(submission.representative?.email) &&
      Boolean(submission.externalAccount?.accountNumber) &&
      Boolean(submission.tosAccepted);
    this.dueByAccount.set(
      stripeAccountId,
      complete ? [] : (this.dueByAccount.get(stripeAccountId) ?? []),
    );
    return this.getAccountSession(stripeAccountId);
  }

  async attachPaymentMethod(
    participantId: string,
    paymentMethodId: string,
  ): Promise<PaymentMethodRef> {
    this.methods.set(participantId, paymentMethodId);
    return { paymentMethodId };
  }

  async createPayment(input: {
    invoiceId: string;
    amount: string;
    currency: string;
    producerStripeAccountId: string;
    consumerPaymentMethodId: string;
  }): Promise<PspPaymentResult> {
    void input.amount;
    void input.currency;
    void input.producerStripeAccountId;
    const fail = input.consumerPaymentMethodId.startsWith("pm_fail_");
    const result: PspPaymentResult = fail
      ? {
          stripePaymentId: `pi_test_${randomUUID().slice(0, 8)}`,
          status: "failed",
          failureCategory: input.consumerPaymentMethodId.includes("insufficient")
            ? "insufficient_funds"
            : "declined",
        }
      : {
          stripePaymentId: `pi_test_${randomUUID().slice(0, 8)}`,
          status: "succeeded",
        };
    this.payments.push(result);
    return result;
  }

  async refund(stripePaymentId: string): Promise<{ status: "refunded" }> {
    void stripePaymentId;
    return { status: "refunded" };
  }

  verifyWebhook(rawBody: string, signature: string): WebhookVerification {
    const expected = createHmac("sha256", TEST_SECRET)
      .update(rawBody)
      .digest("hex");
    if (signature !== `t=1,v1=${expected}`) {
      return { ok: false };
    }
    try {
      const payload = JSON.parse(rawBody) as {
        type?: string;
        data?: Record<string, unknown>;
      };
      return {
        ok: true,
        eventType: payload.type,
        payload: payload.data ?? {},
      };
    } catch {
      return { ok: false };
    }
  }

  /** Test helper — sign a webhook body. */
  static sign(rawBody: string): string {
    const expected = createHmac("sha256", TEST_SECRET)
      .update(rawBody)
      .digest("hex");
    return `t=1,v1=${expected}`;
  }
}
