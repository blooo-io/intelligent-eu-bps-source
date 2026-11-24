import { createHmac, randomUUID } from "node:crypto";
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
import type {
  CreateKycTestFixtureAccountInput,
  KycTestFixturePort,
  KycTestFixtureSession,
  KycTestFixtureSubmission,
} from "./kyc-test-fixture.port.js";
import type { PayoutPort, PayoutResult } from "./payout.port.js";
import type { PspEventsPort, PspEventVerification } from "./psp-events.port.js";
import { PRODUCER_ONBOARDING_DUE } from "./psp.port.js";
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
import { PspError, type PspEvent, type PspPaymentMethodType } from "./psp.types.js";

const TEST_SECRET = "whsec_test_intelligent";

type ConnectedAccountState = {
  participantId: string;
  country: string;
  currentlyDue: string[];
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  status: PspAccountStatus["status"];
  manualSchedule: boolean;
  /** currency → available balance in minor units */
  balances: Map<string, number>;
};

type ChargeRecord = CollectResult & {
  invoiceId: string;
  amount: string;
  currency: string;
  pspAccountRef: string;
  feeAmount?: string;
  settled: boolean;
};

function toMinor(amount: string): number {
  const [whole, frac = ""] = amount.split(".");
  const cents = `${frac}00`.slice(0, 2);
  return Number(whole) * 100 + Number(cents);
}

function fromMinor(minor: number): string {
  return (minor / 100).toFixed(2);
}

/** Card: round(amountMinor × 1.5%) + €0.25; SEPA: €0.35 flat (UAT-057). */
function cardFeeMinor(amountMinor: number): number {
  return Math.round(amountMinor * 0.015) + 25;
}

function shortId(): string {
  return randomUUID().replaceAll("-", "").slice(0, 16);
}

/**
 * Stripe test-mode stand-in (BR-12). No network; signatures use a local HMAC.
 * Implements neutral PSP ports (WS5 Task 5.3 / INT-424) and keeps legacy
 * {@link PspPort} methods for callers until Task 5.6 deletes the old port.
 * S10-style card failure can be forced via paymentMethodId prefix `pm_fail_`.
 */
export class MockPspAdapter
  implements
    KycOnboardingPort,
    CollectPort,
    PayoutPort,
    PspEventsPort,
    KycTestFixturePort,
    PspPort
{
  readonly accounts = new Map<string, string>();
  readonly methods = new Map<string, string>();
  private readonly methodOwners = new Map<string, string>();
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

  private readonly connected = new Map<string, ConnectedAccountState>();
  private readonly customers = new Map<string, string>();
  private readonly chargesByKey = new Map<string, ChargeRecord>();
  private readonly chargesByRef = new Map<string, ChargeRecord>();
  private readonly checkoutsByKey = new Map<string, CheckoutSession>();
  private readonly payoutsByKey = new Map<string, PayoutResult>();
  private accountSeq = 0;

  // ── Neutral: KycOnboardingPort ──────────────────────────────────────────

  async createConnectedAccount(input: {
    participantId: string;
    country: string;
  }): Promise<{ pspAccountRef: string }> {
    const pspAccountRef = `mock_acct_${shortId()}`;
    this.connected.set(pspAccountRef, {
      participantId: input.participantId,
      country: input.country,
      currentlyDue: ["business_profile.url", "external_account"],
      chargesEnabled: false,
      payoutsEnabled: false,
      status: "requirements_due",
      manualSchedule: false,
      balances: new Map(),
    });
    this.dueByAccount.set(pspAccountRef, [
      "business_profile.url",
      "external_account",
    ]);
    return { pspAccountRef };
  }

  async createOnboardingSession(input: {
    pspAccountRef: string;
    mode: "hosted" | "embedded";
    returnUrl?: string;
    refreshUrl?: string;
  }): Promise<KycOnboardingSession> {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    if (input.mode === "hosted") {
      return {
        pspAccountRef: input.pspAccountRef,
        mode: "hosted",
        onboardingUrl: `https://connect.mock.invalid/onboarding/${input.pspAccountRef}`,
        expiresAt,
      };
    }
    return {
      pspAccountRef: input.pspAccountRef,
      mode: "embedded",
      clientSecret: `accs_secret_test_${input.pspAccountRef}`,
      expiresAt,
    };
  }

  async getAccountStatus(pspAccountRef: string): Promise<PspAccountStatus> {
    const state = this.connected.get(pspAccountRef);
    if (state) {
      return {
        pspAccountRef,
        status: state.status,
        currentlyDue: [...state.currentlyDue],
        chargesEnabled: state.chargesEnabled,
        payoutsEnabled: state.payoutsEnabled,
      };
    }
    const due = this.dueByAccount.get(pspAccountRef) ?? [];
    const complete = due.length === 0;
    return {
      pspAccountRef,
      status: complete ? "complete" : "requirements_due",
      currentlyDue: [...due],
      chargesEnabled: complete,
      payoutsEnabled: complete,
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
    const owner = this.methodOwners.get(paymentMethodId);
    if (owner && owner !== participantId) {
      throw new Error("payment_method_owned_by_other");
    }
    this.methodOwners.set(paymentMethodId, participantId);
    this.methods.set(participantId, paymentMethodId);
    return { paymentMethodId, pspPaymentMethodRef: paymentMethodId };
  }

  async getPaymentMethodDetails(
    paymentMethodId: string,
  ): Promise<PaymentMethodDetails & CollectPaymentMethodDetails> {
    const base = await this.resolvePaymentMethodDetails(paymentMethodId);
    return {
      ...base,
      pspPaymentMethodRef: paymentMethodId,
    };
  }

  async ensureCustomer(input: {
    participantId: string;
    pspAccountRef: string;
  }): Promise<{ pspCustomerRef: string }> {
    const key = `${input.participantId}|${input.pspAccountRef}`;
    const existing = this.customers.get(key);
    if (existing) return { pspCustomerRef: existing };
    const pspCustomerRef = `mock_cus_${shortId()}`;
    this.customers.set(key, pspCustomerRef);
    this.connectedCustomers.push({
      participantId: input.participantId,
      stripeAccountId: input.pspAccountRef,
      stripeCustomerId: pspCustomerRef,
    });
    return { pspCustomerRef };
  }

  async createDirectCharge(input: DirectChargeInput): Promise<CollectResult> {
    const existing = this.chargesByKey.get(input.idempotencyKey);
    if (existing) {
      return {
        pspPaymentRef: existing.pspPaymentRef,
        status: existing.status,
        method: existing.method,
        failureCategory: existing.failureCategory,
      };
    }

    const details = await this.resolvePaymentMethodDetails(
      input.pspPaymentMethodRef,
    );
    const pspPaymentRef = `mock_pay_${shortId()}`;
    const amountMinor = toMinor(input.amount);

    let record: ChargeRecord;
    if (
      input.pspPaymentMethodRef.startsWith("pm_fail_") ||
      details.type === "card" && input.pspPaymentMethodRef.includes("decline")
    ) {
      record = {
        pspPaymentRef,
        status: "failed",
        method: "card",
        failureCategory: "card_declined",
        invoiceId: input.invoiceId,
        amount: input.amount,
        currency: input.currency,
        pspAccountRef: input.pspAccountRef,
        settled: false,
      };
    } else if (details.type === "sepa_debit") {
      record = {
        pspPaymentRef,
        status: "pending",
        method: "sepa_debit",
        invoiceId: input.invoiceId,
        amount: input.amount,
        currency: input.currency,
        pspAccountRef: input.pspAccountRef,
        settled: false,
      };
    } else {
      record = {
        pspPaymentRef,
        status: "succeeded",
        method: "card",
        invoiceId: input.invoiceId,
        amount: input.amount,
        currency: input.currency,
        pspAccountRef: input.pspAccountRef,
        feeAmount: fromMinor(cardFeeMinor(amountMinor)),
        settled: true,
      };
    }

    this.chargesByKey.set(input.idempotencyKey, record);
    this.chargesByRef.set(pspPaymentRef, record);
    return {
      pspPaymentRef: record.pspPaymentRef,
      status: record.status,
      method: record.method,
      failureCategory: record.failureCategory,
    };
  }

  async createCheckoutSession(input: CheckoutInput): Promise<CheckoutSession> {
    const existing = this.checkoutsByKey.get(input.idempotencyKey);
    if (existing) return { ...existing };
    const pspCheckoutRef = `mock_co_${shortId()}`;
    const session: CheckoutSession = {
      pspCheckoutRef,
      checkoutUrl: `https://checkout.mock.invalid/${pspCheckoutRef}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
    this.checkoutsByKey.set(input.idempotencyKey, session);
    return { ...session };
  }

  async getChargeSettlement(input: {
    pspPaymentRef: string;
    pspAccountRef: string;
  }): Promise<ChargeSettlement | null> {
    const charge = this.chargesByRef.get(input.pspPaymentRef);
    if (!charge || charge.pspAccountRef !== input.pspAccountRef) return null;
    if (!charge.settled || charge.feeAmount === undefined) return null;
    if (!charge.method) return null;
    return {
      method: charge.method,
      feeAmount: charge.feeAmount,
      feeCurrency: charge.currency.toUpperCase(),
    };
  }

  async refund(
    arg: string | { pspPaymentRef: string; pspAccountRef: string },
  ): Promise<{ status: "refunded" }> {
    void arg;
    return { status: "refunded" };
  }

  // ── Neutral: PayoutPort ─────────────────────────────────────────────────

  async setManualSchedule(accountRef: string): Promise<void> {
    const state = this.connected.get(accountRef);
    if (state) state.manualSchedule = true;
  }

  async getAvailableBalance(
    accountRef: string,
    currency: string,
  ): Promise<{ amount: string; currency: string }> {
    const state = this.connected.get(accountRef);
    const minor = state?.balances.get(currency.toUpperCase()) ?? 0;
    return { amount: fromMinor(minor), currency: currency.toUpperCase() };
  }

  async createPayout(
    accountRef: string,
    amount: string,
    currency: string,
    idempotencyKey: string,
  ): Promise<PayoutResult> {
    const existing = this.payoutsByKey.get(idempotencyKey);
    if (existing) return { ...existing };

    const state = this.connected.get(accountRef);
    const cur = currency.toUpperCase();
    const need = toMinor(amount);
    const available = state?.balances.get(cur) ?? 0;
    if (need > available) {
      throw new PspError(
        "insufficient_balance",
        `available ${fromMinor(available)} ${cur}, requested ${amount}`,
      );
    }
    if (state) {
      state.balances.set(cur, available - need);
    }
    const result: PayoutResult = {
      pspPayoutRef: `mock_po_${shortId()}`,
      status: "pending",
    };
    this.payoutsByKey.set(idempotencyKey, result);
    return { ...result };
  }

  // ── Neutral: PspEventsPort ──────────────────────────────────────────────

  verifyEvent(rawBody: string, signature: string): PspEventVerification {
    const expected = createHmac("sha256", TEST_SECRET)
      .update(rawBody)
      .digest("hex");
    if (signature !== `t=1,v1=${expected}`) {
      return { ok: false };
    }
    try {
      const event = JSON.parse(rawBody) as PspEvent;
      if (
        typeof event.eventId !== "string" ||
        typeof event.kind !== "string" ||
        typeof event.occurredAt !== "string"
      ) {
        return { ok: false };
      }
      return { ok: true, event };
    } catch {
      return { ok: false };
    }
  }

  // ── Neutral: KycTestFixturePort ─────────────────────────────────────────

  async createAccountToken(
    _submission: OnboardingRequirementsSubmission | KycTestFixtureSubmission,
  ): Promise<string> {
    const id = `ct_test_${shortId()}`;
    this.tokens.push(id);
    return id;
  }

  async createProducerAccount(
    input: CreateProducerAccountInput | CreateKycTestFixtureAccountInput,
  ): Promise<ProducerAccount & { pspAccountRef: string }> {
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
    return { stripeAccountId, pspAccountRef: stripeAccountId };
  }

  async submitAccountRequirements(
    stripeAccountId: string,
    submission: OnboardingRequirementsSubmission | KycTestFixtureSubmission,
    _clientIp: string,
  ): Promise<OnboardingSession & KycTestFixtureSession> {
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
    const session = await this.getAccountSession(stripeAccountId);
    return {
      ...session,
      pspAccountRef: stripeAccountId,
    };
  }

  // ── Legacy PspPort (kept until Task 5.6) ────────────────────────────────

  async createEmbeddedProducerAccount(
    input: CreateEmbeddedProducerAccountInput,
  ): Promise<ProducerAccount> {
    this.accountSeq += 1;
    const stripeAccountId = `acct_test_${input.participantId.replaceAll("-", "").slice(0, 12)}${this.accountSeq}`;
    this.accounts.set(input.participantId, stripeAccountId);
    this.dueByAccount.set(stripeAccountId, [...PRODUCER_ONBOARDING_DUE]);
    return { stripeAccountId };
  }

  async createAccountOnboardingSession(
    stripeAccountId: string,
  ): Promise<{ clientSecret: string }> {
    return { clientSecret: `accs_secret_test_${stripeAccountId}` };
  }

  /** Test seam: the producer finished the embedded component (Stripe side). */
  completeOnboarding(stripeAccountId: string): void {
    this.dueByAccount.set(stripeAccountId, []);
    const state = this.connected.get(stripeAccountId);
    if (state) {
      state.currentlyDue = [];
      state.chargesEnabled = true;
      state.payoutsEnabled = true;
      state.status = "complete";
    }
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

  async createSetupIntent(
    participantId: string,
  ): Promise<{ clientSecret: string }> {
    return {
      clientSecret: `seti_test_${participantId.replaceAll("-", "").slice(0, 12)}_secret_test`,
    };
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
    if (
      (await this.resolvePaymentMethodDetails(consumerPaymentMethodId)).type ===
      "sepa_debit"
    ) {
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

  // ── Test helpers (contract harness) ─────────────────────────────────────

  /** Mark KYC complete — charges and payouts enabled (REQ-051). */
  async completeKyc(pspAccountRef: string): Promise<void> {
    this.dueByAccount.set(pspAccountRef, []);
    const state = this.connected.get(pspAccountRef);
    if (state) {
      state.currentlyDue = [];
      state.chargesEnabled = true;
      state.payoutsEnabled = true;
      state.status = "complete";
    }
  }

  async fundBalance(
    pspAccountRef: string,
    amount: string,
    currency: string,
  ): Promise<void> {
    let state = this.connected.get(pspAccountRef);
    if (!state) {
      state = {
        participantId: "unknown",
        country: "FR",
        currentlyDue: [],
        chargesEnabled: true,
        payoutsEnabled: true,
        status: "complete",
        manualSchedule: false,
        balances: new Map(),
      };
      this.connected.set(pspAccountRef, state);
    }
    const cur = currency.toUpperCase();
    const prev = state.balances.get(cur) ?? 0;
    state.balances.set(cur, prev + toMinor(amount));
  }

  async paymentMethod(
    kind: "card_ok" | "card_decline" | "sepa_ok",
  ): Promise<string> {
    switch (kind) {
      case "card_ok":
        return "pm_card_visa";
      case "card_decline":
        return `pm_fail_${shortId().slice(0, 8)}`;
      case "sepa_ok":
        return `pm_sepa_${shortId().slice(0, 8)}`;
    }
  }

  /**
   * Settle a pending SEPA charge (mock-only). Returns a signed payment.succeeded
   * event for webhook-style tests.
   */
  settleSepa(
    pspPaymentRef: string,
    at: string,
  ): { rawBody: string; signature: string } {
    const charge = this.chargesByRef.get(pspPaymentRef);
    if (!charge || charge.method !== "sepa_debit") {
      throw new Error(`no pending SEPA charge ${pspPaymentRef}`);
    }
    charge.status = "succeeded";
    charge.settled = true;
    charge.feeAmount = "0.35";
    return this.signEvent({
      kind: "payment.succeeded",
      pspAccountRef: charge.pspAccountRef,
      pspPaymentRef,
      invoiceId: charge.invoiceId,
      method: "sepa_debit",
      occurredAt: at,
    });
  }

  /** Sign a neutral {@link PspEvent} body (HMAC-SHA256, whsec_test_intelligent). */
  signEvent(
    e: Omit<PspEvent, "eventId" | "occurredAt"> & { occurredAt?: string },
  ): { rawBody: string; signature: string } {
    const event: PspEvent = {
      eventId: `mock_evt_${shortId()}`,
      occurredAt: e.occurredAt ?? new Date().toISOString(),
      kind: e.kind,
      pspAccountRef: e.pspAccountRef,
      participantId: e.participantId,
      invoiceId: e.invoiceId,
      pspPaymentRef: e.pspPaymentRef,
      pspCheckoutRef: e.pspCheckoutRef,
      pspPayoutRef: e.pspPayoutRef,
      method: e.method,
      failureCategory: e.failureCategory,
    };
    const rawBody = JSON.stringify(event);
    return { rawBody, signature: MockPspAdapter.sign(rawBody) };
  }

  /** Test helper — sign a webhook body. */
  static sign(rawBody: string): string {
    const expected = createHmac("sha256", TEST_SECRET)
      .update(rawBody)
      .digest("hex");
    return `t=1,v1=${expected}`;
  }

  private async resolvePaymentMethodDetails(
    paymentMethodId: string,
  ): Promise<{
    paymentMethodId: string;
    type: PspPaymentMethodType;
    brand: string;
    last4: string;
  }> {
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
}
