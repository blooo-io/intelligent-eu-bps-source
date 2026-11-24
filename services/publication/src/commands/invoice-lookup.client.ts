import {
  resolveServiceAuthHeaders,
  type ServiceAuthSource,
} from "@intelligent/module-template";
import type { InvoiceAuthzView } from "./billing-command.types.js";

/**
 * REQ-052 — GET /internal/v1/invoices/{invoiceId} (AC-06).
 */
export interface InvoiceLookupClient {
  getInvoice(invoiceId: string): Promise<InvoiceAuthzView | null>;
}

export class HttpInvoiceLookupClient implements InvoiceLookupClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly auth: ServiceAuthSource = null,
  ) {}

  async getInvoice(invoiceId: string): Promise<InvoiceAuthzView | null> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/invoices/${encodeURIComponent(invoiceId)}`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        ...(await resolveServiceAuthHeaders("ac-10-publication", this.auth)),
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`invoicing getInvoice failed with ${res.status}`);
    }
    const body = (await res.json()) as {
      invoiceId: string;
      communityId: string;
      consumerId: string;
      producerId: string;
    };
    return {
      invoiceId: body.invoiceId,
      communityId: body.communityId,
      invoiceIssuedTo: body.consumerId,
      invoiceIssuedBy: body.producerId,
    };
  }
}

export class StubInvoiceLookupClient implements InvoiceLookupClient {
  constructor(
    private readonly byId: Map<string, InvoiceAuthzView> = new Map(),
  ) {}

  set(view: InvoiceAuthzView): void {
    this.byId.set(view.invoiceId, view);
  }

  async getInvoice(invoiceId: string): Promise<InvoiceAuthzView | null> {
    return this.byId.get(invoiceId) ?? null;
  }
}
