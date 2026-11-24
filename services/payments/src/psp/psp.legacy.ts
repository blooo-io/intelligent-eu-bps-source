/**
 * Temporary types for adapter methods still called until Tasks 5.7 / 5.8
 * rewrite pay + webhook on neutral ports.
 */
import type { KycTestFixtureSubmission } from "./kyc-test-fixture.port.js";

export type OnboardingRequirementsSubmission = KycTestFixtureSubmission;
export type ProducerAccount = { pspAccountRef: string };
export type LegacyOnboardingSession = {
  mode: "embedded" | "hosted" | "requirements" | "link" | "elements";
  status: "requirements_due" | "pending_verification" | "complete";
  pspAccountRef?: string;
  currentlyDue?: string[];
  eventuallyDue?: string[];
  url?: string;
  clientSecret?: string;
  /** Present when mode is hosted (A7 Account Link). */
  expiresAt?: string;
  /** REQ-045 / REQ-051 — mirror of account.payouts_enabled. */
  payoutsEnabled?: boolean;
  /** REQ-051 — account.requirements.disabled_reason when present. */
  disabledReason?: string;
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
export const PRODUCER_ONBOARDING_DUE = [
  "business_type","business_profile.url","business_profile.mcc",
  "representative.first_name","representative.last_name","representative.email",
  "representative.dob","external_account","tos_acceptance.date",
] as const;
