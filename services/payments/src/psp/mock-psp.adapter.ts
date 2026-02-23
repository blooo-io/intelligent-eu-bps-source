import { createHmac, randomUUID } from "node:crypto";
import type {
  CreateProducerAccountInput,
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
  readonly tokens: string[] = [];

  async createAccountToken(
    submission: OnboardingRequirementsSubmission,
  ): Promise<string> {
    const id = `ct_test_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    this.tokens.push(id);
    void submission;
    return id;
  }

  async createProducerAccount(
    input: CreateProducerAccountInput,
  ): Promise<ProducerAccount> {
    if (!input.accountToken) {
      throw new Error("accountToken required for Custom Connect create (INT-191)");
    }
    const stripeAccountId = `acct_test_${input.participantId.replace(/-/g, "").slice(0, 16)}`;
    this.accounts.set(input.participantId, stripeAccountId);
    // Token covers legal entity / ToS; remaining due are outside the token.
    this.dueByAccount.set(stripeAccountId, [
      "business_profile.url",
      "business_profile.mcc",
      "external_account",
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
    const remaining = new Set(this.dueByAccount.get(stripeAccountId) ?? []);
    if (submission.accountToken || submission.tosAccepted) {
      remaining.delete("tos_acceptance.date");
      remaining.delete("business_type");
      remaining.delete("representative.first_name");
      remaining.delete("representative.last_name");
      remaining.delete("representative.email");
    }
    if (submission.businessType) remaining.delete("business_type");
    if (submission.businessProfileUrl) remaining.delete("business_profile.url");
    if (submission.businessProfileMcc) remaining.delete("business_profile.mcc");
    if (submission.representative?.firstName) {
      remaining.delete("representative.first_name");
    }
    if (submission.representative?.lastName) {
      remaining.delete("representative.last_name");
    }
    if (submission.representative?.email) {
      remaining.delete("representative.email");
    }
    if (submission.externalAccount?.accountNumber) {
      remaining.delete("external_account");
    }
    this.dueByAccount.set(stripeAccountId, [...remaining]);
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
