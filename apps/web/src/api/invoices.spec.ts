import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./me";
import {
  fetchInvoice,
  fetchInvoicePdfBlob,
  fetchMyInvoices,
  invoiceDocumentUrl,
  payInvoice,
} from "./invoices";

const sample = {
  invoiceId: "55555555-5555-5555-5555-555555555555",
  producerId: "33333333-3333-3333-3333-333333333333",
  consumerId: "11111111-1111-1111-1111-111111111111",
  currency: "EUR",
  status: "Open",
  amounts: { energy: "10.00", vat: "2.00", total: "12.00" },
  tradeIds: ["t1", "t2"],
};

describe("invoices API (REQ-007 / REQ-014 / REQ-039)", () => {
  it("lists and fetches detail", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [sample] })
      .mockResolvedValueOnce({ ok: true, json: async () => sample });
    expect(
      await fetchMyInvoices("https://api.example/", "tok", fetchImpl as unknown as typeof fetch),
    ).toHaveLength(1);
    expect(
      await fetchInvoice(
        "https://api.example",
        "tok",
        sample.invoiceId,
        fetchImpl as unknown as typeof fetch,
      ),
    ).toMatchObject({ status: "Open" });
  });

  it("pays an invoice", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        paymentId: "66666666-6666-6666-6666-666666666666",
        invoiceId: sample.invoiceId,
        amount: "12.00",
        currency: "EUR",
        status: "Succeeded",
      }),
    });
    const payment = await payInvoice(
      "https://api.example",
      "tok",
      sample.invoiceId,
      fetchImpl as unknown as typeof fetch,
    );
    expect(payment.status).toBe("Succeeded");
    expect(fetchImpl.mock.calls[0][1].method).toBe("POST");
  });

  it("builds document URL and fetches PDF blob", async () => {
    expect(invoiceDocumentUrl("https://api.example/", "id-1")).toBe(
      "https://api.example/v1/invoices/id-1/document",
    );
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["%PDF"], { type: "application/pdf" }),
    });
    const blob = await fetchInvoicePdfBlob(
      "https://api.example",
      "tok",
      "id-1",
      fetchImpl as unknown as typeof fetch,
    );
    expect(blob.type).toBe("application/pdf");
  });

  it("throws ApiError on pay failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(
      payInvoice("https://api.example", "tok", "id", fetchImpl as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("throws ApiError on list, detail and PDF failures", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(
      fetchMyInvoices("https://api.example", "tok", fetchImpl as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      fetchInvoice("https://api.example", "tok", "id", fetchImpl as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      fetchInvoicePdfBlob("https://api.example", "tok", "id", fetchImpl as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
