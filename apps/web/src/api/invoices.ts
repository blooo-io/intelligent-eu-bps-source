/**
 * Public API clients for invoices and pay (REQ-007, REQ-014, REQ-039).
 */

import { ApiError } from "./me";

export type InvoiceAmounts = {
  energy: string;
  vat: string;
  total: string;
};

/** REQ-007 — one trade on the invoice. */
export type InvoiceTradeLine = {
  tradeId: string;
  deliveryStart?: string;
  deliveryEnd?: string;
  kWh: string;
  pricePerKWh: string;
  amount: string;
};

export type Invoice = {
  invoiceId: string;
  legalNumber?: string;
  producerId: string;
  consumerId: string;
  period?: string;
  currency: string;
  status: string;
  dueDate?: string;
  tradeIds?: string[];
  lines?: InvoiceTradeLine[];
  amounts: InvoiceAmounts;
  billingMode?: string;
};

export type Payment = {
  paymentId: string;
  invoiceId: string;
  amount: string;
  currency: string;
  status: string;
  method?: string;
};

export async function fetchMyInvoices(
  apiBaseUrl: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Invoice[]> {
  const res = await fetchImpl(`${apiBaseUrl.replace(/\/$/, "")}/v1/me/invoices`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `GET /v1/me/invoices failed with ${res.status}`);
  }
  return (await res.json()) as Invoice[];
}

export async function fetchInvoice(
  apiBaseUrl: string,
  accessToken: string,
  invoiceId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Invoice> {
  const res = await fetchImpl(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/invoices/${invoiceId}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (!res.ok) {
    throw new ApiError(res.status, `GET /v1/invoices/{id} failed with ${res.status}`);
  }
  return (await res.json()) as Invoice;
}

/** Absolute URL for the hosted PDF (opened with bearer via fetch blob, or link with token). */
export function invoiceDocumentUrl(apiBaseUrl: string, invoiceId: string): string {
  return `${apiBaseUrl.replace(/\/$/, "")}/v1/invoices/${invoiceId}/document`;
}

export async function payInvoice(
  apiBaseUrl: string,
  accessToken: string,
  invoiceId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Payment> {
  const res = await fetchImpl(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/invoices/${invoiceId}/payments`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `POST /v1/invoices/{id}/payments failed with ${res.status}`,
    );
  }
  return (await res.json()) as Payment;
}

/** Download PDF with bearer (REQ-039 — Stripe-hosted document via API). */
export async function fetchInvoicePdfBlob(
  apiBaseUrl: string,
  accessToken: string,
  invoiceId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Blob> {
  const res = await fetchImpl(invoiceDocumentUrl(apiBaseUrl, invoiceId), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `GET /v1/invoices/{id}/document failed with ${res.status}`);
  }
  return res.blob();
}
