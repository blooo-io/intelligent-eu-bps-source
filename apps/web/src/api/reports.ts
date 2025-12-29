/**
 * Public API clients for member history and periodic summary (REQ-031, REQ-032).
 */

import { ApiError } from "./me";
import type { Invoice, Payment } from "./invoices";

export type MemberHistory = {
  participantId: string;
  invoices: Invoice[];
  payments: Payment[];
};

export type PeriodicSummary = {
  communityId: string;
  period: string;
  currency?: string;
  invoiceCount: number;
  paymentCount: number;
  total: string;
};

export async function fetchParticipantHistory(
  apiBaseUrl: string,
  accessToken: string,
  participantId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MemberHistory> {
  const res = await fetchImpl(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/participants/${participantId}/history`,
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
      `GET /v1/participants/{id}/history failed with ${res.status}`,
    );
  }
  return (await res.json()) as MemberHistory;
}

export async function fetchPeriodicSummary(
  apiBaseUrl: string,
  accessToken: string,
  communityId: string,
  period: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PeriodicSummary> {
  const qs = new URLSearchParams({ communityId, period });
  const res = await fetchImpl(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/reports/summary?${qs.toString()}`,
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
      `GET /v1/reports/summary failed with ${res.status}`,
    );
  }
  return (await res.json()) as PeriodicSummary;
}
