/**
 * Public API client for PUT /v1/me/profile (REQ-009 / UAT-009).
 * Only name, address and email are writable by the participant.
 */

import type { BillingProfile } from "./me";
import { ApiError } from "./me";

export type BillingProfileWrite = BillingProfile;

/** Update the caller's billing profile (name, address, email only). */
export async function putMyProfile(
  apiBaseUrl: string,
  accessToken: string,
  body: BillingProfileWrite,
  fetchImpl: typeof fetch = fetch,
): Promise<BillingProfile> {
  const res = await fetchImpl(`${apiBaseUrl.replace(/\/$/, "")}/v1/me/profile`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ApiError(res.status, `PUT /v1/me/profile failed with ${res.status}`);
  }
  return (await res.json()) as BillingProfile;
}
