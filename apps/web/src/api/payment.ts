/**
 * Public API client for payment-account onboarding (REQ-051 / UAT-063 / INT-190 / INT-193).
 * Served by AC-07.
 */

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
  /** INT-191 — Stripe Account Token id from Stripe.js. */
  accountToken?: string;
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

/** Start payment-account onboarding (producer requirements or consumer elements). */
export async function createPaymentOnboarding(
  apiBaseUrl: string,
  accessToken: string,
): Promise<OnboardingSession> {
  const res = await fetch(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/me/payment-account/onboarding`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
  );
  if (!res.ok) {
    throw new Error(
      `POST /v1/me/payment-account/onboarding failed with ${res.status}`,
    );
  }
  return (await res.json()) as OnboardingSession;
}

/** Submit Connect KYC requirements (INT-190 / producer path). */
export async function submitPaymentOnboardingRequirements(
  apiBaseUrl: string,
  accessToken: string,
  body: OnboardingRequirementsSubmission,
): Promise<OnboardingSession> {
  const res = await fetch(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/me/payment-account/onboarding/requirements`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(
      `POST /v1/me/payment-account/onboarding/requirements failed with ${res.status}`,
    );
  }
  return (await res.json()) as OnboardingSession;
}

/** Attach consumer payment method after SetupIntent confirm (INT-193 / REQ-040). */
export async function attachMyPaymentMethod(
  apiBaseUrl: string,
  accessToken: string,
  paymentMethodId: string,
): Promise<OnboardingSession> {
  const res = await fetch(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/me/payment-account/payment-method`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paymentMethodId }),
    },
  );
  if (!res.ok) {
    throw new Error(
      `POST /v1/me/payment-account/payment-method failed with ${res.status}`,
    );
  }
  return (await res.json()) as OnboardingSession;
}
