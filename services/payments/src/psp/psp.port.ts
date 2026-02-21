/** P-PSP port (03 §7) — Stripe Connect test mode in V1 (BR-12). */

export type ProducerAccount = {
  stripeAccountId: string;
};

/** INT-190 — in-platform Connect KYC session (no Account Link for producers). */
export type OnboardingSession = {
  mode: "requirements" | "link";
  status: "requirements_due" | "pending_verification" | "complete";
  stripeAccountId?: string;
  currentlyDue?: string[];
  eventuallyDue?: string[];
  url?: string;
};

export type OnboardingRequirementsSubmission = {
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

export interface PspPort {
  createProducerAccount(participantId: string): Promise<ProducerAccount>;
  /** INT-190 — read Connect requirements for an existing account. */
  getAccountSession(stripeAccountId: string): Promise<OnboardingSession>;
  /** INT-190 — push KYC fields to Stripe; returns refreshed session. */
  submitAccountRequirements(
    stripeAccountId: string,
    submission: OnboardingRequirementsSubmission,
    clientIp: string,
  ): Promise<OnboardingSession>;
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
