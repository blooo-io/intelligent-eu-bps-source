import { describe, expect, it, vi } from "vitest";
import {
  HttpInvoiceLookup,
  InMemoryInvoiceLookup,
} from "./invoice-lookup.port.js";

describe("InvoiceLookupPort (INT-193)", () => {
  it("InMemoryInvoiceLookup stores and returns invoices", async () => {
    const mem = new InMemoryInvoiceLookup();
    mem.put({
      invoiceId: "inv-1",
      producerId: "p",
      consumerId: "c",
      currency: "EUR",
      status: "Open",
      total: "2.00",
      producerStripeAccountId: "acct_1",
    });
    await expect(mem.getInvoice("inv-1")).resolves.toMatchObject({
      total: "2.00",
      producerStripeAccountId: "acct_1",
    });
    await expect(mem.getInvoice("missing")).rejects.toThrow(/Unknown invoice/);
  });

  it("HttpInvoiceLookup GETs AC-06 with service principal headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        invoiceId: "inv-2",
        producerId: "p",
        consumerId: "c",
        currency: "EUR",
        status: "Open",
        total: "3.00",
      }),
    });
    const http = new HttpInvoiceLookup(
      "http://invoicing:8080/",
      "svc-token",
      fetchImpl as unknown as typeof fetch,
    );
    await expect(http.getInvoice("inv-2")).resolves.toMatchObject({
      invoiceId: "inv-2",
      total: "3.00",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://invoicing:8080/internal/v1/invoices/inv-2",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer svc-token",
          "x-intelligent-roles": "service",
        }),
      }),
    );
  });

  it("HttpInvoiceLookup throws on non-OK", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const http = new HttpInvoiceLookup(
      "http://invoicing:8080",
      "tok",
      fetchImpl as unknown as typeof fetch,
    );
    await expect(http.getInvoice("x")).rejects.toThrow(/failed with 404/);
  });
});
