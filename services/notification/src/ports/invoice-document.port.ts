import {
  resolveServiceAuthHeaders,
  type ServiceAuthSource,
} from "@intelligent/module-template";

/**
 * Fetch the billing-stored invoice PDF (REQ-039 / A6).
 * Called by AC-11 on InvoiceIssued and payment reminders.
 */
export interface InvoiceDocumentPort {
  fetch(
    invoiceId: string,
  ): Promise<{ legalNumber: string; content: Buffer } | null>;
}

export const INVOICE_DOCUMENT_PORT = Symbol("INVOICE_DOCUMENT_PORT");

/** Returns null — used when INVOICING_INTERNAL_URL is unset (CI / redelivery tests). */
export class NullInvoiceDocument implements InvoiceDocumentPort {
  async fetch(
    _invoiceId: string,
  ): Promise<{ legalNumber: string; content: Buffer } | null> {
    return null;
  }
}

/**
 * HTTP GetInvoiceDocument against AC-06.
 * Selected when INVOICING_INTERNAL_URL is set (cluster).
 */
export class HttpInvoiceDocument implements InvoiceDocumentPort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly auth: ServiceAuthSource = null,
  ) {}

  async fetch(
    invoiceId: string,
  ): Promise<{ legalNumber: string; content: Buffer } | null> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/invoices/${invoiceId}/document`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        ...(await resolveServiceAuthHeaders("ac-11-notification", this.auth)),
      },
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(
        `invoicing getInvoiceDocument ${invoiceId} failed with ${res.status}`,
      );
    }
    const legalNumber = res.headers.get("X-Legal-Number")?.trim() ?? "";
    if (!legalNumber) {
      throw new Error(
        `invoicing getInvoiceDocument ${invoiceId} missing X-Legal-Number`,
      );
    }
    const content = Buffer.from(await res.arrayBuffer());
    return { legalNumber, content };
  }
}

/** In-memory stub for unit tests. */
export class MapInvoiceDocument implements InvoiceDocumentPort {
  constructor(
    private readonly byId = new Map<
      string,
      { legalNumber: string; content: Buffer }
    >(),
  ) {}

  put(
    invoiceId: string,
    doc: { legalNumber: string; content: Buffer },
  ): void {
    this.byId.set(invoiceId, doc);
  }

  async fetch(
    invoiceId: string,
  ): Promise<{ legalNumber: string; content: Buffer } | null> {
    return this.byId.get(invoiceId) ?? null;
  }
}

export function createInvoiceDocument(
  env: NodeJS.ProcessEnv = process.env,
): InvoiceDocumentPort {
  const base = env.INVOICING_INTERNAL_URL;
  if (base) {
    return new HttpInvoiceDocument(base);
  }
  return new NullInvoiceDocument();
}
