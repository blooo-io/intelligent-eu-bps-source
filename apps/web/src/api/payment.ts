/**
 * Public API client for payment-account onboarding (REQ-051 / UAT-063 / INT-190 / INT-193 / INT-255).
 * Served by AC-07.
 */

/** INT-255 — Ready Payment method / Payout account summary. */
export type MePaymentAccount = {
  status: "none" | "requirements_due" | "pending_verification" | "complete";
  brand?: string;
  last4?: string;
  stripeAccountId?: string;
  dashboardUrl?: string;
};

export type OnboardingSession = {
  /** INT-362 — producer `embedded` (Connect Account onboarding component). */
  mode: "embedded" | "requirements" | "link" | "elements";
  status: "requirements_due" | "pending_verification" | "complete";
  stripeAccountId?: string;
  currentlyDue?: string[];
  eventuallyDue?: string[];
  url?: string;
  /** SetupIntent (elements) or Account Session (embedded) client secret. */
  clientSecret?: string;
};

/** INT-255 — read brand/last4 or Connect dashboard link for Ready UI. */
export async function fetchMyPaymentAccount(
  apiBaseUrl: string,
  accessToken: string,
): Promise<MePaymentAccount> {
  const res = await fetch(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/me/payment-account`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
  );
  if (!res.ok) {
    throw new Error(
      `GET /v1/me/payment-account failed with ${res.status}`,
    );
  }
  return (await res.json()) as MePaymentAccount;
}

/** Start payment-account onboarding (producer embedded Connect or consumer elements). */
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
