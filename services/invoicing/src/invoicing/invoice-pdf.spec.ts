import { describe, expect, it, vi } from "vitest";
import { isStripeDocumentUrl, loadStripeInvoicePdf } from "./invoice-pdf.js";

describe("invoice PDF proxy (INT-389 / REQ-039 / ANO-008)", () => {
  it("accepts only https Stripe hosts", () => {
    expect(isStripeDocumentUrl("https://invoice.stripe.com/i/in_1")).toBe(true);
    expect(isStripeDocumentUrl("https://pay.stripe.com/invoice/in_1/pdf")).toBe(true);
    expect(isStripeDocumentUrl("https://files.stripe.com/v1/files/file_1")).toBe(true);
    expect(isStripeDocumentUrl("http://invoice.stripe.com/i/in_1")).toBe(false);
    expect(isStripeDocumentUrl("https://invoice.stripe.com.evil.test/i/in_1")).toBe(false);
    expect(isStripeDocumentUrl("https://example.com/invoice.pdf")).toBe(false);
    expect(isStripeDocumentUrl("not a url")).toBe(false);
  });

  it("returns the upstream PDF bytes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(Buffer.from("%PDF-1.1"), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    );
    const bytes = await loadStripeInvoicePdf(
      "https://pay.stripe.com/invoice/in_1/pdf",
      fetchImpl as unknown as typeof fetch,
    );
    expect(bytes.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://pay.stripe.com/invoice/in_1/pdf",
      { redirect: "follow" },
    );
  });

  it("does not fetch a non-Stripe URL", async () => {
    const fetchImpl = vi.fn();
    await expect(
      loadStripeInvoicePdf("https://example.com/secret.pdf", fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/not a Stripe document/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails when Stripe does not return the document", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    await expect(
      loadStripeInvoicePdf(
        "https://invoice.stripe.com/i/missing",
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/failed with 404/);
  });
});
