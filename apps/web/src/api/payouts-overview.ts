/**
 * Manager payout overview (REQ-060).
 * GET /v1/communities/{id}/payouts-overview.
 */

import { ApiError } from "./me";
import type { PayoutStatus } from "./payouts";

export type PayoutOverviewStatus = "completed" | "open";

export type PayoutOverviewRow = {
  participantId: string;
  period: string;
  expectedAmount: string;
  currency: string;
  status: PayoutOverviewStatus;
  payoutId?: string;
  paidOutAmount?: string;
  payoutStatus?: PayoutStatus;
};

export async function fetchPayoutsOverview(
  apiBaseUrl: string,
  accessToken: string,
  communityId: string,
  period?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PayoutOverviewRow[]> {
  const qs = period ? `?period=${encodeURIComponent(period)}` : "";
  const res = await fetchImpl(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/communities/${communityId}/payouts-overview${qs}`,
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
      `GET /v1/communities/{id}/payouts-overview failed with ${res.status}`,
    );
  }
  return (await res.json()) as PayoutOverviewRow[];
}
