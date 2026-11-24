/**
 * INT-428 Task 2.15 — invoice document port (REQ-039).
 */
import { describe, expect, it, vi } from "vitest";
import {
  createInvoiceDocument,
  HttpInvoiceDocument,
  NullInvoiceDocument,
} from "./invoice-document.port.js";

describe("invoice document port (INT-428)", () => {
  it("uses NullInvoiceDocument without INVOICING_INTERNAL_URL", () => {
    expect(createInvoiceDocument({})).toBeInstanceOf(NullInvoiceDocument);
  });

  it("uses HttpInvoiceDocument when INVOICING_INTERNAL_URL is set", () => {
    expect(
      createInvoiceDocument({
        INVOICING_INTERNAL_URL: "http://invoicing:8080",
      }),
    ).toBeInstanceOf(HttpInvoiceDocument);
  });

  it("HttpInvoiceDocument returns PDF + legal number from X-Legal-Number", async () => {
    const pdf = Buffer.from("%PDF-test");
    const http = new HttpInvoiceDocument(
      "http://invoicing:8080",
      vi.fn(async () =>
        new Response(pdf, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "X-Legal-Number": "SB-66666666-000001",
          },
        }),
      ) as never,
    );
    await expect(http.fetch("inv-1")).resolves.toEqual({
      legalNumber: "SB-66666666-000001",
      content: pdf,
    });
  });

  it("HttpInvoiceDocument returns null on 404", async () => {
    const http = new HttpInvoiceDocument(
      "http://invoicing:8080",
      vi.fn(async () => new Response(null, { status: 404 })) as never,
    );
    await expect(http.fetch("inv-missing")).resolves.toBeNull();
  });

  it("NullInvoiceDocument always returns null", async () => {
    await expect(new NullInvoiceDocument().fetch("any")).resolves.toBeNull();
  });
});
