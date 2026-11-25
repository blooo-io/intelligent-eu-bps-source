/** KYC / Connect onboarding port (WS5 Task 5.2 / INT-424). REQ-051 / A5 / A7. */

export type PspAccountStatus = {
  pspAccountRef: string;
  status: "requirements_due" | "pending_verification" | "complete";
  currentlyDue: string[];
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
};

export type OnboardingSession = {
  pspAccountRef: string;
  mode: "hosted" | "embedded";
  /** Hosted — URL on the PSP domain. */
  onboardingUrl?: string;
  /** Embedded — short-lived client secret; never logged. */
  clientSecret?: string;
  expiresAt: string;
};

export type HostedKycLink = {
  url: string;
  expiresAt: string;
};

export type IdentityVerificationSession = {
  verificationId: string;
  url: string;
  /** A7-bis embedded — Stripe.js verifyIdentity client secret. */
  clientSecret?: string;
};

export type IdentityVerificationStatus = {
  status: "requires_input" | "processing" | "verified" | "canceled";
  errorCode: string | null;
};

/**
 * REQ-051 — Connect account.updated plus Stripe Identity session events
 * that drive KycStatusChanged (identifiers only).
 */
export const KYC_WEBHOOK_EVENTS = [
  "account.updated",
  "identity.verification_session.verified",
  "identity.verification_session.requires_input",
  "identity.verification_session.canceled",
] as const;

export type KycWebhookEvent = (typeof KYC_WEBHOOK_EVENTS)[number];

export interface KycOnboardingPort {
  createConnectedAccount(input: {
    participantId: string;
    country: string;
  }): Promise<{ pspAccountRef: string }>;
  createOnboardingSession(input: {
    pspAccountRef: string;
    mode: "hosted" | "embedded";
    returnUrl?: string;
    refreshUrl?: string;
  }): Promise<OnboardingSession>;
  getAccountStatus(pspAccountRef: string): Promise<PspAccountStatus>;
  /**
   * REQ-051 / A7 — PSP-hosted KYC Account Link with eventually_due collection.
   * Naming stays PSP-neutral (`accountRef`).
   */
  createHostedKycLink(
    accountRef: string,
    urls: { returnUrl: string; refreshUrl: string },
  ): Promise<HostedKycLink>;
  /** REQ-051 — Stripe Identity for community managers (A5). */
  createIdentityVerification(input: {
    subjectId: string;
    returnUrl: string;
  }): Promise<IdentityVerificationSession>;
  getIdentityVerification(
    verificationId: string,
  ): Promise<IdentityVerificationStatus>;
}

export const KYC_ONBOARDING_PORT = Symbol("KYC_ONBOARDING_PORT");
