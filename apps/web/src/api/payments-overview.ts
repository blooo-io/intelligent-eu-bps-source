/**
 * Manager payments overview and manual invoice status (REQ-018, REQ-044).
 * GET /v1/communities/{id}/payments-overview, POST /v1/invoices/{id}/status.
 */

import { ApiError } from "./me";

export type OverviewPayment = {
  paymentId: string;
  invoiceId: string;
  amount: string;
  currency: string;
  status: string;
  method?: string;
  failureCategory?: string;
};

export type InvoiceStatus =
  | "Draft"
  | "Open"
  | "PartiallyPaid"
  | "Paid"
  | "Overdue"
  | "Void"
  | "Disputed";

export type InvoiceStatusChange = {
  status: InvoiceStatus;
  reason: string;
};

export type Invoice = {
  invoiceId: string;
  status: string;
  [key: string]: unknown;
};

export async function fetchPaymentsOverview(
  apiBaseUrl: string,
  accessToken: string,
  communityId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OverviewPayment[]> {
  const res = await fetchImpl(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/communities/${communityId}/payments-overview`,
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
      `GET /v1/communities/{id}/payments-overview failed with ${res.status}`,
    );
  }
  return (await res.json()) as OverviewPayment[];
}

export async function setInvoiceStatus(
  apiBaseUrl: string,
  accessToken: string,
  invoiceId: string,
  body: InvoiceStatusChange,
  fetchImpl: typeof fetch = fetch,
): Promise<Invoice> {
  const res = await fetchImpl(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/invoices/${invoiceId}/status`,
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
      `POST /v1/invoices/{id}/status failed with ${res.status}`,
    );
  }
  return (await res.json()) as Invoice;
}
