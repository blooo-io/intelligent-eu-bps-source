/**
 * Public API clients for community billing settings (REQ-006, REQ-043, REQ-056).
 * GET/PUT /v1/communities/{id}/settings.
 */

import { ApiError } from "./me";

export type BillingMode = "live" | "virtual";

export type CommunitySettings = {
  communityId: string;
  currency: string;
  billingPeriod: string;
  threshold: string;
  vatRate: string;
  billingMode: BillingMode;
};

export type CommunitySettingsWrite = {
  currency: string;
  billingPeriod: string;
  threshold: string;
  vatRate: string;
  billingMode: BillingMode;
};

/** Read community currency, period, threshold, VAT and mode. */
export async function fetchCommunitySettings(
  apiBaseUrl: string,
  accessToken: string,
  communityId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CommunitySettings> {
  const res = await fetchImpl(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/communities/${communityId}/settings`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `GET /v1/communities/{id}/settings failed with ${res.status}`,
    );
  }
  return (await res.json()) as CommunitySettings;
}

/** Update community billing settings (manager — BR-12). */
export async function putCommunitySettings(
  apiBaseUrl: string,
  accessToken: string,
  communityId: string,
  body: CommunitySettingsWrite,
  fetchImpl: typeof fetch = fetch,
): Promise<CommunitySettings> {
  const res = await fetchImpl(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/communities/${communityId}/settings`,
    {
      method: "PUT",
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
      `PUT /v1/communities/{id}/settings failed with ${res.status}`,
    );
  }
  return (await res.json()) as CommunitySettings;
}
