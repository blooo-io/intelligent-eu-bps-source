/**
 * Public API clients for billing runs (REQ-006 / UAT-006).
 * POST /v1/communities/{id}/billing-runs, GET /v1/billing-runs/{id}.
 */

import { ApiError } from "./me";

export type BillingRunType = "periodic" | "early" | "final";

export type BillingRun = {
  runId: string;
  communityId: string;
  period?: string;
  type: BillingRunType;
  status: string;
  version: number;
};

export type BillingRunCreate = {
  type: BillingRunType;
  period?: string;
};

export async function startBillingRun(
  apiBaseUrl: string,
  accessToken: string,
  communityId: string,
  body: BillingRunCreate,
  fetchImpl: typeof fetch = fetch,
): Promise<BillingRun> {
  const res = await fetchImpl(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/communities/${communityId}/billing-runs`,
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
      `POST /v1/communities/{id}/billing-runs failed with ${res.status}`,
    );
  }
  return (await res.json()) as BillingRun;
}

export async function getBillingRun(
  apiBaseUrl: string,
  accessToken: string,
  runId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BillingRun> {
  const res = await fetchImpl(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/billing-runs/${runId}`,
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
      `GET /v1/billing-runs/{id} failed with ${res.status}`,
    );
  }
  return (await res.json()) as BillingRun;
}
