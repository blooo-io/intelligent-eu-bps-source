/**
 * Public API client for billing statements (REQ-059).
 */

import { ApiError } from "./me";

export type StatementDirection = "to_pay" | "to_receive" | "balanced";

export type StatementStatus =
  | "Open"
  | "PartiallyPaid"
  | "Paid"
  | "Overdue"
  | "Void";

/** REQ-059 — monthly participant statement. */
export type Statement = {
  statementId: string;
  participantId: string;
  communityId: string;
  period: string;
  periodFrom: string;
  periodUntil: string;
  totalBought: string;
  totalSold: string;
  netBalance: string;
  direction: StatementDirection;
  currency: string;
  invoiceIds: string[];
  status: StatementStatus;
  revision: number;
};

export async function fetchMyStatements(
  apiBaseUrl: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Statement[]> {
  const res = await fetchImpl(`${apiBaseUrl.replace(/\/$/, "")}/v1/me/statements`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `GET /v1/me/statements failed with ${res.status}`);
  }
  return (await res.json()) as Statement[];
}
