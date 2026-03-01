/**
 * INT-193 — AC-07 looks up invoice amount + producer Connect id from AC-06.
 */

export type InvoiceLookupResult = {
  invoiceId: string;
  producerId: string;
  consumerId: string;
  currency: string;
  status: string;
  total: string;
  producerStripeAccountId?: string;
};

export type InvoiceLookupPort = {
  getInvoice(invoiceId: string): Promise<InvoiceLookupResult>;
};

export const INVOICE_LOOKUP = Symbol("INVOICE_LOOKUP");

/** In-memory stub for unit tests. */
export class InMemoryInvoiceLookup implements InvoiceLookupPort {
  private rows = new Map<string, InvoiceLookupResult>();

  put(row: InvoiceLookupResult): void {
    this.rows.set(row.invoiceId, { ...row });
  }

  async getInvoice(invoiceId: string): Promise<InvoiceLookupResult> {
    const row = this.rows.get(invoiceId);
    if (!row) {
      throw new Error(`Unknown invoice ${invoiceId}`);
    }
    return { ...row };
  }
}

/** HTTP client for AC-06 GetInvoice. */
export class HttpInvoiceLookup implements InvoiceLookupPort {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getInvoice(invoiceId: string): Promise<InvoiceLookupResult> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/invoices/${invoiceId}`;
    const res = await this.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${this.serviceToken}`,
        Accept: "application/json",
        "x-intelligent-roles": "service",
        "x-intelligent-sub": "ac-07-payments",
      },
    });
    if (!res.ok) {
      throw new Error(`invoicing getInvoice failed with ${res.status}`);
    }
    return (await res.json()) as InvoiceLookupResult;
  }
}
