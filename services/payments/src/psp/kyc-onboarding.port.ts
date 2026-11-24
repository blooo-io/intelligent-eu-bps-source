/** KYC / Connect onboarding port (WS5 Task 5.2 / INT-424). REQ-051. */

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
}

export const KYC_ONBOARDING_PORT = Symbol("KYC_ONBOARDING_PORT");
