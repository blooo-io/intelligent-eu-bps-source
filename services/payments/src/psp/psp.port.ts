/** P-PSP port (03 §7) — Stripe Connect test mode in V1 (BR-12). */

export type ProducerAccount = {
  stripeAccountId: string;
};

export type OnboardingLink = {
  url: string;
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
  onboardingLink(stripeAccountId: string, returnUrl: string): Promise<OnboardingLink>;
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
