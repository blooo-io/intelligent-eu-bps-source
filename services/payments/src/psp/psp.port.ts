/** P-PSP port (03 §7) — Stripe Connect test mode in V1 (BR-12). */

export type ProducerAccount = {
  stripeAccountId: string;
};

/**
 * INT-362 — producer embedded Connect onboarding (`embedded`), consumer
 * SetupIntent session (`elements` / `link`). `requirements` is the deprecated
 * INT-191 API KYC path for accounts created before INT-362.
 */
export type OnboardingSession = {
  mode: "embedded" | "requirements" | "link" | "elements";
  status: "requirements_due" | "pending_verification" | "complete";
  stripeAccountId?: string;
  currentlyDue?: string[];
  eventuallyDue?: string[];
  url?: string;
  /**
   * SetupIntent client secret when mode is elements (INT-193), or Account
   * Session client secret when mode is embedded (INT-362). Never logged.
   */
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
  /**
   * INT-195 — Stripe File id for individual.verification.document.front
   * (test token `file_identity_document_success` or uploads API id).
   */
  identityDocumentFront?: string;
  identityDocumentAdditionalFront?: string;
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

export type CreateEmbeddedProducerAccountInput = {
  participantId: string;
  country?: string;
};

export type PaymentMethodRef = {
  paymentMethodId: string;
};

/** INT-255 / INT-276 — card or SEPA display fields from Stripe (never stored). */
export type PaymentMethodDetails = {
  paymentMethodId: string;
  /** Stripe PaymentMethod.type — card | sepa_debit (REQ-014). */
  type?: "card" | "sepa_debit";
  brand?: string;
  last4?: string;
};

export type PspPaymentResult = {
  /** PaymentIntent id on the producer Connect account (or the invoice id when Stripe exposes none). */
  stripePaymentId: string;
  status: "pending" | "succeeded" | "failed";
  failureCategory?: string;
};

/**
 * INT-355 / REQ-014 — direct charge: pay the producer's Stripe invoice on the
 * producer Connect account with a clone of the consumer's platform PaymentMethod.
 */
export type PspPaymentInput = {
  invoiceId: string;
  amount: string;
  currency: string;
  producerStripeAccountId: string;
  /** Stripe invoice (in_…) issued by AC-06 on the producer Connect account. */
  stripeInvoiceId: string;
  /** Consumer Customer on the producer Connect account (EnsureConnectedCustomer). */
  connectedCustomerId: string;
  /** Platform PaymentMethod saved through the SetupIntent flow. */
  consumerPaymentMethodId: string;
};

export type WebhookVerification = {
  ok: boolean;
  /** Stripe Event.id — INT-326 / 04 §7 idempotency key. */
  eventId?: string;
  eventType?: string;
  payload?: Record<string, unknown>;
};

/** Initial currently_due keys of a new producer account (mock PSP). */
export const PRODUCER_ONBOARDING_DUE = [
  "business_type",
  "business_profile.url",
  "business_profile.mcc",
  "representative.first_name",
  "representative.last_name",
  "representative.email",
  "representative.dob",
  "external_account",
  "tos_acceptance.date",
] as const;

/** Event types mapped to PaymentStatusChanged (platform and Connect endpoints). */
export const PAYMENT_WEBHOOK_EVENTS = [
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

export interface PspPort {
  /**
   * INT-191 — create a Custom Connect account with `account_token`
   * (controller.requirement_collection=application, losses=application).
   * INT-362 — test fixtures only (operator `payment-accounts:provision`):
   * Stripe does not let the platform accept the terms of service of accounts
   * it does not collect requirements for, so seeds cannot use the embedded path.
   */
  createProducerAccount(input: CreateProducerAccountInput): Promise<ProducerAccount>;
  /**
   * INT-362 — portal producer account. The producer pays Stripe fees and bears
   * disputes (fees.payer=account); Stripe collects KYC and covers losses the
   * producer cannot repay (losses.payments=stripe, requirement_collection=stripe).
   * The platform absorbs no cost.
   */
  createEmbeddedProducerAccount(
    input: CreateEmbeddedProducerAccountInput,
  ): Promise<ProducerAccount>;
  /**
   * INT-362 — Account Session for the Connect embedded Account onboarding
   * component. The client secret is short-lived and returned to the browser only.
   */
  createAccountOnboardingSession(
    stripeAccountId: string,
  ): Promise<{ clientSecret: string }>;
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
  /** INT-255 — retrieve card brand/last4 for Ready Payment method UI (TP-7). */
  getPaymentMethodDetails(
    paymentMethodId: string,
  ): Promise<PaymentMethodDetails>;
  /**
   * INT-355 — create the consumer's Customer on a producer Connect account
   * (metadata participantId only, no personal data).
   */
  createConnectedCustomer(input: {
    participantId: string;
    stripeAccountId: string;
  }): Promise<{ stripeCustomerId: string }>;
  createPayment(input: PspPaymentInput): Promise<PspPaymentResult>;
  refund(stripePaymentId: string): Promise<{ status: "refunded" }>;
  verifyWebhook(rawBody: string, signature: string): WebhookVerification;
}

export const PSP_PORT = Symbol("PSP_PORT");
