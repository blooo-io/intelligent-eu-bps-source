/**
 * Temporary types for adapter methods still called until Tasks 5.7 / 5.8
 * rewrite pay + webhook on neutral ports.
 */
import type { KycTestFixtureSubmission } from "./kyc-test-fixture.port.js";

export type OnboardingRequirementsSubmission = KycTestFixtureSubmission;
export type ProducerAccount = { pspAccountRef: string };
export type LegacyOnboardingSession = {
  mode: "embedded" | "requirements" | "link" | "elements";
  status: "requirements_due" | "pending_verification" | "complete";
  pspAccountRef?: string;
  currentlyDue?: string[];
  eventuallyDue?: string[];
  url?: string;
  clientSecret?: string;
};
export type CreateProducerAccountInput = {
  participantId: string; accountToken: string; country?: string;
};
export type CreateEmbeddedProducerAccountInput = {
  participantId: string; country?: string;
};
export type PaymentMethodRef = { pspPaymentMethodRef: string };
export type PaymentMethodDetails = {
  pspPaymentMethodRef: string;
  type?: "card" | "sepa_debit";
  brand?: string;
  last4?: string;
};
export type PspPaymentInput = {
  invoiceId: string; amount: string; currency: string;
  pspAccountRef: string; pspInvoiceRef: string;
  pspCustomerRef: string; pspPaymentMethodRef: string;
};
export type PspPaymentResult = {
  pspPaymentRef: string;
  status: "pending" | "succeeded" | "failed";
  failureCategory?: string;
};
export const PRODUCER_ONBOARDING_DUE = [
  "business_type","business_profile.url","business_profile.mcc",
  "representative.first_name","representative.last_name","representative.email",
  "representative.dob","external_account","tos_acceptance.date",
] as const;
