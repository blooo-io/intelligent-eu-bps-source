/**
 * Session / account shapes shared by Connect onboarding helpers that sit
 * beside {@link KycOnboardingPort} (getAccountSession, fixture submit).
 * A5 / A7 — Stripe collects KYC; surface is hosted Account Link or embedded
 * Account Session.
 */

export type ProducerAccount = { pspAccountRef: string };

/**
 * Richer session than {@link import("./kyc-onboarding.port.js").OnboardingSession}:
 * used when mirroring account.updated / requirements poll into billing KYC.
 */
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
