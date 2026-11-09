import { createHmac, randomUUID } from "node:crypto";
import type {
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
  readonly connectedCustomers: Array<{
    participantId: string;
    stripeAccountId: string;
    stripeCustomerId: string;
  }> = [];
  readonly paymentInputs: PspPaymentInput[] = [];
  private readonly paidInvoices = new Map<string, PspPaymentResult>();

  async createAccountToken(
    _submission: OnboardingRequirementsSubmission,
  ): Promise<string> {
    const id = `ct_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    this.tokens.push(id);
    return id;
  }

  private accountSeq = 0;

  async createProducerAccount(
    input: CreateProducerAccountInput,
  ): Promise<ProducerAccount> {
    if (!input.accountToken) {
      throw new Error("accountToken required for Custom Connect create (INT-191)");
    }
    // INT-228 — each create returns a new id (mirrors live Stripe accounts.create).
    this.accountSeq += 1;
    const stripeAccountId = `acct_test_${input.participantId.replaceAll("-", "").slice(0, 12)}${this.accountSeq}`;
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
    _clientIp: string,
  ): Promise<OnboardingSession> {
    const remaining = new Set(this.dueByAccount.get(stripeAccountId) ?? []);
    if (submission.accountToken || submission.tosAccepted) {
      remaining.delete("tos_acceptance.date");
      remaining.delete("business_type");
      remaining.delete("representative.first_name");
      remaining.delete("representative.last_name");
      remaining.delete("representative.email");
      remaining.delete("representative.dob");
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
    if (submission.representative?.dob) {
      remaining.delete("representative.dob");
    }
    if (submission.externalAccount?.accountNumber) {
      remaining.delete("external_account");
    }
    this.dueByAccount.set(stripeAccountId, [...remaining]);
    return this.getAccountSession(stripeAccountId);
  }

  async createSetupIntent(
    participantId: string,
  ): Promise<{ clientSecret: string }> {
    return {
      clientSecret: `seti_test_${participantId.replaceAll("-", "").slice(0, 12)}_secret_test`,
    };
  }

  async attachPaymentMethod(
    participantId: string,
    paymentMethodId: string,
  ): Promise<PaymentMethodRef> {
    this.methods.set(participantId, paymentMethodId);
    return { paymentMethodId };
  }

  async getPaymentMethodDetails(
    paymentMethodId: string,
  ): Promise<PaymentMethodDetails> {
    // INT-276 — SEPA test fixture (Stripe pm_sepa_debit).
    if (
      paymentMethodId.includes("sepa") ||
      paymentMethodId === "pm_sepa_debit"
    ) {
      return {
        paymentMethodId,
        type: "sepa_debit",
        brand: "sepa_debit",
        last4: "3000",
      };
    }
    // Fixture ids used in UAT / seed (pm_card_visa → Visa 4242).
    if (paymentMethodId.includes("visa") || paymentMethodId === "pm_card_visa") {
      return { paymentMethodId, type: "card", brand: "visa", last4: "4242" };
    }
    if (paymentMethodId.includes("mastercard")) {
      return {
        paymentMethodId,
        type: "card",
        brand: "mastercard",
        last4: "4444",
      };
    }
    return { paymentMethodId, type: "card", brand: "visa", last4: "4242" };
  }

  async createConnectedCustomer(input: {
    participantId: string;
    stripeAccountId: string;
  }): Promise<{ stripeCustomerId: string }> {
    const stripeCustomerId = `cus_test_${randomUUID().replaceAll("-", "").slice(0, 14)}`;
    this.connectedCustomers.push({ ...input, stripeCustomerId });
    return { stripeCustomerId };
  }

  /** INT-355 — mirrors Stripe: a paid invoice is never charged twice. */
  async createPayment(input: PspPaymentInput): Promise<PspPaymentResult> {
    this.paymentInputs.push({ ...input });
    const alreadyPaid = this.paidInvoices.get(input.stripeInvoiceId);
    if (alreadyPaid) {
      return { ...alreadyPaid };
    }
    const { consumerPaymentMethodId } = input;
    // Mirrors Stripe: sepa_debit cannot be shared with a connected account.
    if ((await this.getPaymentMethodDetails(consumerPaymentMethodId)).type === "sepa_debit") {
      const refused: PspPaymentResult = {
        stripePaymentId: `pi_test_${randomUUID().slice(0, 8)}`,
        status: "failed",
        failureCategory: "sepa_debit_not_shareable",
      };
      this.payments.push(refused);
      return refused;
    }
    const fail = consumerPaymentMethodId.startsWith("pm_fail_");
    const result: PspPaymentResult = fail
      ? {
          stripePaymentId: `pi_test_${randomUUID().slice(0, 8)}`,
          status: "failed",
          failureCategory: consumerPaymentMethodId.includes("insufficient")
            ? "insufficient_funds"
            : "declined",
        }
      : {
          stripePaymentId: `pi_test_${randomUUID().slice(0, 8)}`,
          status: "succeeded",
        };
    this.payments.push(result);
    if (result.status === "succeeded") {
      this.paidInvoices.set(input.stripeInvoiceId, result);
    }
    return result;
  }

  async refund(_stripePaymentId: string): Promise<{ status: "refunded" }> {
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
        id?: string;
        type?: string;
        data?: Record<string, unknown>;
      };
      return {
        ok: true,
        // INT-326 — mirror Stripe Event.id for webhook dedupe tests.
        eventId: typeof payload.id === "string" ? payload.id : undefined,
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
