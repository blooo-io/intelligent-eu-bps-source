/**
 * Public API client for producer payouts and withdrawals (REQ-015, REQ-060).
 */

import { ApiError } from "./me";

export type PayoutStatus =
  | "requested"
  | "in_transit"
  | "paid"
  | "failed"
  | "canceled";

export type PayoutTrigger = "participant" | "auto";

export type Payout = {
  payoutId: string;
  participantId: string;
  period: string;
  amount: string;
  currency: string;
  status: PayoutStatus;
  trigger: PayoutTrigger;
  requestedAt: string;
  arrivalDate?: string;
  failureCategory?: string;
};

export type WithdrawablePeriod = {
  period: string;
  amount: string;
  currency: string;
};

export type PayoutList = {
  items: Payout[];
  withdrawable: WithdrawablePeriod[];
};

export type PayoutRefusedReason =
  | "kyc_required"
  | "statement_not_found"
  | "producer_invoices_unpaid"
  | "nothing_to_pay_out"
  | "funds_pending";

async function readRefusalReason(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { reason?: string };
    return typeof body.reason === "string" ? body.reason : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchMyPayouts(
  apiBaseUrl: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PayoutList> {
  const res = await fetchImpl(`${apiBaseUrl.replace(/\/$/, "")}/v1/me/payouts`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `GET /v1/me/payouts failed with ${res.status}`);
  }
  return (await res.json()) as PayoutList;
}

/** REQ-015 — participant-triggered Connect payout for one period. */
export async function requestWithdrawal(
  apiBaseUrl: string,
  accessToken: string,
  period: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Payout> {
  const res = await fetchImpl(`${apiBaseUrl.replace(/\/$/, "")}/v1/me/payouts`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ period }),
  });
  if (!res.ok) {
    const reason = await readRefusalReason(res);
    throw new ApiError(
      res.status,
      `POST /v1/me/payouts failed with ${res.status}`,
      reason,
    );
  }
  return (await res.json()) as Payout;
}
