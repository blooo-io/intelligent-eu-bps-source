/**
 * REQ-039 — the public contract returns the PDF bytes (200 application/pdf).
 * A browser fetch cannot follow the Stripe redirect (ANO-008). The service
 * loads the document from an allowlisted Stripe HTTPS URL and returns the body.
 */

const STRIPE_DOCUMENT_HOST = /(^|\.)stripe\.com$/;

export function isStripeDocumentUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" && STRIPE_DOCUMENT_HOST.test(parsed.hostname);
}

export async function loadStripeInvoicePdf(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer> {
  if (!isStripeDocumentUrl(url)) {
    throw new Error("Invoice document URL is not a Stripe document");
  }
  const res = await fetchImpl(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Stripe document failed with ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
