/**
 * Public API clients for balances and early settlement (REQ-057 / UAT-074 / BR-05).
 */

import { ApiError } from "./me";

export type Balance = {
  counterpartId: string;
  amount: string;
  currency: string;
  since?: string;
};

export type BillingRun = {
  runId: string;
  communityId: string;
  type: string;
  status: string;
  version: number;
  period?: string;
};

export async function fetchMyBalances(
  apiBaseUrl: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Balance[]> {
  const res = await fetchImpl(`${apiBaseUrl.replace(/\/$/, "")}/v1/me/balances`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `GET /v1/me/balances failed with ${res.status}`);
  }
  return (await res.json()) as Balance[];
}

/** Consumer settles unbilled balance with one producer now (threshold does not apply — BR-05). */
export async function createEarlySettlement(
  apiBaseUrl: string,
  accessToken: string,
  producerId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BillingRun> {
  const res = await fetchImpl(`${apiBaseUrl.replace(/\/$/, "")}/v1/early-settlements`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ producerId }),
  });
  if (!res.ok) {
    throw new ApiError(res.status, `POST /v1/early-settlements failed with ${res.status}`);
  }
  return (await res.json()) as BillingRun;
}
