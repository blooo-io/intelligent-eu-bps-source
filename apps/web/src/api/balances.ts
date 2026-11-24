/**
 * Public API client for unbilled balances (REQ-056).
 */

import { ApiError } from "./me";

export type Balance = {
  counterpartId: string;
  amount: string;
  currency: string;
  since?: string;
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
