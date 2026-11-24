import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./me";
import { fetchMyPayouts, requestWithdrawal } from "./payouts";

const participantId = "11111111-1111-1111-1111-111111111111";

describe("payouts API (REQ-015 / REQ-060)", () => {
  it("lists payouts and withdrawable periods", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [],
        withdrawable: [{ period: "2026-10", amount: "19.70", currency: "EUR" }],
      }),
    });
    const list = await fetchMyPayouts(
      "https://api.example/",
      "tok",
      fetchImpl as unknown as typeof fetch,
    );
    expect(list.withdrawable).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith("https://api.example/v1/me/payouts", {
      headers: {
        Accept: "application/json",
        Authorization: "Bearer tok",
      },
    });
  });

  it("posts a withdrawal for the period", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        payoutId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        participantId,
        period: "2026-10",
        amount: "19.70",
        currency: "EUR",
        status: "in_transit",
        trigger: "participant",
        requestedAt: "2026-11-01T12:00:00Z",
      }),
    });
    const payout = await requestWithdrawal(
      "https://api.example",
      "tok",
      "2026-10",
      fetchImpl as unknown as typeof fetch,
    );
    expect(payout.status).toBe("in_transit");
    expect(fetchImpl).toHaveBeenCalledWith("https://api.example/v1/me/payouts", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "Bearer tok",
      },
      body: JSON.stringify({ period: "2026-10" }),
    });
  });

  it("carries 409 PayoutRefused reason on ApiError", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ reason: "producer_invoices_unpaid" }),
    });
    const err = await requestWithdrawal(
      "https://api.example",
      "tok",
      "2026-10",
      fetchImpl as unknown as typeof fetch,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).reason).toBe("producer_invoices_unpaid");
  });

  it("throws ApiError on list failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(
      fetchMyPayouts(
        "https://api.example",
        "tok",
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
