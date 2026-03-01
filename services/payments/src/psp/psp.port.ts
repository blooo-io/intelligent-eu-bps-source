/** P-PSP port (03 §7) — Stripe Connect test mode in V1 (BR-12). */

export type ProducerAccount = {
  stripeAccountId: string;
};

/** INT-190 / INT-193 — in-platform Connect KYC or consumer SetupIntent session. */
export type OnboardingSession = {
  mode: "requirements" | "link" | "elements";
  status: "requirements_due" | "pending_verification" | "complete";
  stripeAccountId?: string;
  currentlyDue?: string[];
  eventuallyDue?: string[];
  url?: string;
  /** SetupIntent client secret when mode is elements (INT-193). */
  clientSecret?: string;
};

export type OnboardingRequirementsSubmission = {
  /** INT-191 — Stripe Account Token from Stripe.js or tokens.create. */
  accountToken?: string;
  /** Connected-account country (outside the token). Default FR for this platform. */
  country?: string;
  businessType?: "individual" | "company";
  businessProfileUrl?: string;
  businessProfileMcc?: string;
  representative?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    dob?: { day: number; month: number; year: number };
    address?: {
      line1?: string;
      city?: string;
      postalCode?: string;
      country?: string;
    };
  };
  externalAccount?: {
    country?: string;
    currency?: string;
    accountNumber?: string;
    routingNumber?: string;
  };
  tosAccepted?: boolean;
};

export type CreateProducerAccountInput = {
  participantId: string;
  /** Required for FR Custom accounts (INT-191). */
  accountToken: string;
  country?: string;
};

export type PaymentMethodRef = {
  paymentMethodId: string;
};

export type PspPaymentResult = {
  stripePaymentId: string;
  status: "pending" | "succeeded" | "failed";
  failureCategory?: string;
};

export type WebhookVerification = {
  ok: boolean;
  eventType?: string;
  payload?: Record<string, unknown>;
};

/** Initial currently_due keys before a Custom account exists (INT-191). */
export const PRODUCER_ONBOARDING_DUE = [
  "business_type",
  "business_profile.url",
  "business_profile.mcc",
  "representative.first_name",
  "representative.last_name",
  "representative.email",
  "external_account",
  "tos_acceptance.date",
] as const;

export interface PspPort {
  /**
   * INT-191 — create a Custom Connect account with `account_token`
   * (controller.requirement_collection=application, losses=application).
   */
  createProducerAccount(input: CreateProducerAccountInput): Promise<ProducerAccount>;
  /**
   * INT-191 — build an Account Token from KYC fields (server-side tokens.create).
   * Prefer Stripe.js in the browser; this path covers mock/tests and API fallback.
   */
  createAccountToken(submission: OnboardingRequirementsSubmission): Promise<string>;
  /** INT-190 — read Connect requirements for an existing account. */
  getAccountSession(stripeAccountId: string): Promise<OnboardingSession>;
  /**
   * INT-190 / INT-191 — push KYC to Stripe.
   * Legal-entity / ToS via `account_token` when present; business_profile and
   * external_account remain outside the token.
   */
  submitAccountRequirements(
    stripeAccountId: string,
    submission: OnboardingRequirementsSubmission,
    clientIp: string,
  ): Promise<OnboardingSession>;
  /**
   * INT-193 — create a SetupIntent for consumer payment-method collection
   * (Payment Element / confirmSetup).
   */
  createSetupIntent(participantId: string): Promise<{ clientSecret: string }>;
  attachPaymentMethod(
    participantId: string,
    paymentMethodId: string,
  ): Promise<PaymentMethodRef>;
  createPayment(input: {
    invoiceId: string;
    amount: string;
    currency: string;
    producerStripeAccountId: string;
    consumerPaymentMethodId: string;
  }): Promise<PspPaymentResult>;
  refund(stripePaymentId: string): Promise<{ status: "refunded" }>;
  verifyWebhook(rawBody: string, signature: string): WebhookVerification;
}

export const PSP_PORT = Symbol("PSP_PORT");
