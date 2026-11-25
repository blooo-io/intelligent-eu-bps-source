/**
 * INT-191 KYC test-fixture port (WS5 Task 5.2 / INT-424).
 * Operator seeding only — outside the shared PSP contract suite.
 * Renames stripeAccountId → pspAccountRef; Stripe appears only in adapters.
 */

export type KycTestFixtureSubmission = {
  /** INT-191 — Account Token from the PSP JS SDK or tokens.create. */
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
   * INT-195 — identity document front file id
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

export type KycTestFixtureAccount = {
  pspAccountRef: string;
};

/**
 * INT-191 / INT-362 session shape for the requirements (token) path.
 * Distinct from {@link OnboardingSession} on KycOnboardingPort.
 */
export type KycTestFixtureSession = {
  /** Includes `hosted` so intersection with onboarding session (A7 Account Link) type-checks. */
  mode: "embedded" | "hosted" | "requirements" | "link" | "elements";
  status: "requirements_due" | "pending_verification" | "complete";
  pspAccountRef?: string;
  currentlyDue?: string[];
  eventuallyDue?: string[];
  url?: string;
  /** Short-lived client secret; never logged. */
  clientSecret?: string;
  expiresAt?: string;
  payoutsEnabled?: boolean;
  disabledReason?: string;
};

export type CreateKycTestFixtureAccountInput = {
  participantId: string;
  /** Required for Custom accounts (INT-191). */
  accountToken: string;
  country?: string;
};

export interface KycTestFixturePort {
  /**
   * INT-191 — build an Account Token from KYC fields (server-side tokens.create).
   * Prefer the PSP JS SDK in the browser; this path covers mock/tests and API fallback.
   */
  createAccountToken(submission: KycTestFixtureSubmission): Promise<string>;
  /**
   * INT-191 — create a Custom Connect account with `account_token`.
   * Used by operator `payment-accounts:provision` seeds.
   */
  createProducerAccount(
    input: CreateKycTestFixtureAccountInput,
  ): Promise<KycTestFixtureAccount>;
  /**
   * INT-190 / INT-191 — push KYC requirements to the PSP.
   * Legal-entity / ToS via `accountToken` when present; business_profile and
   * external_account remain outside the token.
   */
  submitAccountRequirements(
    pspAccountRef: string,
    submission: KycTestFixtureSubmission,
    clientIp: string,
  ): Promise<KycTestFixtureSession>;
}

export const KYC_TEST_FIXTURE_PORT = Symbol("KYC_TEST_FIXTURE_PORT");
