import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./me";
import { fetchPaymentsOverview, setInvoiceStatus } from "./payments-overview";

const communityId = "22222222-2222-2222-2222-222222222222";
const invoiceId = "55555555-5555-5555-5555-555555555555";

describe("payments-overview API (REQ-018 / REQ-044)", () => {
  it("lists community payments", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          paymentId: "66666666-6666-6666-6666-666666666666",
          invoiceId,
          amount: "12.00",
          currency: "EUR",
          status: "succeeded",
        },
      ],
    });
    const rows = await fetchPaymentsOverview(
      "https://api.example/",
      "tok",
      communityId,
      fetchImpl as unknown as typeof fetch,
    );
    expect(rows).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.example/v1/communities/${communityId}/payments-overview`,
      {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer tok",
        },
      },
    );
  });

  it("posts manual invoice status with reason", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invoiceId, status: "Paid" }),
    });
    const result = await setInvoiceStatus(
      "https://api.example",
      "tok",
      invoiceId,
      { status: "Paid", reason: "Paid outside platform" },
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.status).toBe("Paid");
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.example/v1/invoices/${invoiceId}/status`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer tok",
        },
        body: JSON.stringify({ status: "Paid", reason: "Paid outside platform" }),
      },
    );
  });

  it("throws ApiError on failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(
      fetchPaymentsOverview(
        "https://api.example",
        "tok",
        communityId,
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      setInvoiceStatus(
        "https://api.example",
        "tok",
        invoiceId,
        { status: "Void", reason: "x" },
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
