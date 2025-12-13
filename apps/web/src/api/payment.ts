/**
 * Public API client for POST /v1/me/payment-account/onboarding (REQ-051 / UAT-063).
 * Served by AC-07; returns a Stripe-hosted onboarding URL (TD-6).
 */

import { ApiError } from "./me";

export type OnboardingLink = {
  url: string;
};

/** Start Stripe onboarding (producer Connect / consumer payment method). */
export async function createPaymentOnboarding(
  apiBaseUrl: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OnboardingLink> {
  const res = await fetchImpl(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/me/payment-account/onboarding`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `POST /v1/me/payment-account/onboarding failed with ${res.status}`,
    );
  }
  return (await res.json()) as OnboardingLink;
}
