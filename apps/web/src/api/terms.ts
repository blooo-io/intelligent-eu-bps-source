/**
 * Public API clients for terms (REQ-050 / UAT-062).
 * GET /v1/terms/current, POST /v1/me/terms-acceptance.
 */

import { ApiError } from "./me";

export type Terms = {
  termsVersion: string;
  text: string;
};

export type TermsAcceptance = {
  termsVersion: string;
  selfBillingMandate: boolean;
  acceptedAt?: string;
};

/** Fetch the current terms text and version. */
export async function fetchCurrentTerms(
  apiBaseUrl: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Terms> {
  const res = await fetchImpl(`${apiBaseUrl.replace(/\/$/, "")}/v1/terms/current`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `GET /v1/terms/current failed with ${res.status}`);
  }
  return (await res.json()) as Terms;
}

/** Record acceptance; producers must set selfBillingMandate true (REQ-050). */
export async function acceptTerms(
  apiBaseUrl: string,
  accessToken: string,
  body: { termsVersion: string; selfBillingMandate: boolean },
  fetchImpl: typeof fetch = fetch,
): Promise<TermsAcceptance> {
  const res = await fetchImpl(`${apiBaseUrl.replace(/\/$/, "")}/v1/me/terms-acceptance`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ApiError(res.status, `POST /v1/me/terms-acceptance failed with ${res.status}`);
  }
  return (await res.json()) as TermsAcceptance;
}
