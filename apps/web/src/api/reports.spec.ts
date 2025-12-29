import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./me";
import { fetchParticipantHistory, fetchPeriodicSummary } from "./reports";

const participantId = "11111111-1111-1111-1111-111111111111";
const communityId = "22222222-2222-2222-2222-222222222222";

describe("reports API (REQ-031 / REQ-032)", () => {
  it("fetches participant history", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        participantId,
        invoices: [],
        payments: [],
      }),
    });
    const result = await fetchParticipantHistory(
      "https://api.example/",
      "tok",
      participantId,
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.participantId).toBe(participantId);
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.example/v1/participants/${participantId}/history`,
      {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer tok",
        },
      },
    );
  });

  it("fetches periodic summary with query params", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        communityId,
        period: "2026-09",
        currency: "EUR",
        invoiceCount: 2,
        paymentCount: 1,
        total: "24.00",
      }),
    });
    const result = await fetchPeriodicSummary(
      "https://api.example",
      "tok",
      communityId,
      "2026-09",
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.invoiceCount).toBe(2);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      `https://api.example/v1/reports/summary?communityId=${communityId}&period=2026-09`,
    );
  });

  it("throws ApiError on failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(
      fetchParticipantHistory(
        "https://api.example",
        "tok",
        participantId,
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      fetchPeriodicSummary(
        "https://api.example",
        "tok",
        communityId,
        "2026-09",
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
