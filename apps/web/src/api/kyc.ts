/**
 * Public API clients for KYC / identity verification (REQ-051 / UAT-063 / INT-429).
 * Managers use hosted Stripe Identity; participants use Connect embedded onboarding.
 */

import { ApiError } from "./me";

export type KycStatus = {
  subjectId: string;
  subjectType: "participant" | "manager";
  kycStatus: "none" | "pending" | "verified" | "rejected";
  kycVerified: boolean;
  method: "connect_onboarding" | "identity_document";
  updatedAt: string;
};

export type IdentityVerificationSession = {
  verificationId: string;
  url: string;
  status: "requires_input" | "processing" | "verified" | "canceled";
};

/** REQ-051 — current KYC state for the signed-in member or manager. */
export async function fetchMyKyc(
  apiBaseUrl: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<KycStatus> {
  const res = await fetchImpl(`${apiBaseUrl.replace(/\/$/, "")}/v1/me/kyc`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `GET /v1/me/kyc failed with ${res.status}`);
  }
  return (await res.json()) as KycStatus;
}

/** REQ-051 — start hosted Identity verification for a community manager. */
export async function createIdentityVerification(
  apiBaseUrl: string,
  accessToken: string,
  body: { returnUrl?: string } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<IdentityVerificationSession> {
  const res = await fetchImpl(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/me/identity-verification`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `POST /v1/me/identity-verification failed with ${res.status}`,
    );
  }
  return (await res.json()) as IdentityVerificationSession;
}
