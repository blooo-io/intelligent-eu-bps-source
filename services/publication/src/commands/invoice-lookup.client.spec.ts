import { describe, expect, it, vi } from "vitest";
import { HttpInvoiceLookupClient } from "./invoice-lookup.client.js";

describe("HttpInvoiceLookupClient (REQ-052)", () => {
  it("maps InternalInvoice consumerId to invoiceIssuedTo", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        invoiceId: "inv-1",
        communityId: "c1",
        consumerId: "cons",
        producerId: "prod",
      }),
    );
    const client = new HttpInvoiceLookupClient(
      "http://invoicing:8080",
      fetchImpl as unknown as typeof fetch,
      "tok-1",
    );
    expect(await client.getInvoice("inv-1")).toEqual({
      invoiceId: "inv-1",
      communityId: "c1",
      invoiceIssuedTo: "cons",
      invoiceIssuedBy: "prod",
    });
  });

  it("returns null on 404", async () => {
    const client = new HttpInvoiceLookupClient(
      "http://invoicing:8080",
      vi.fn(async () => new Response("", { status: 404 })) as unknown as typeof fetch,
    );
    expect(await client.getInvoice("missing")).toBeNull();
  });

  it("throws on other errors", async () => {
    const client = new HttpInvoiceLookupClient(
      "http://invoicing:8080",
      vi.fn(async () => new Response("", { status: 503 })) as unknown as typeof fetch,
    );
    await expect(client.getInvoice("x")).rejects.toThrow(/503/);
  });
});
