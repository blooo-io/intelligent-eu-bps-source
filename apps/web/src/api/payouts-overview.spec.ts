import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./me";
import { fetchPayoutsOverview } from "./payouts-overview";

const communityId = "22222222-2222-2222-2222-222222222222";

describe("payouts-overview API (REQ-060)", () => {
  it("lists community payout overview rows", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          participantId: "11111111-1111-1111-1111-111111111111",
          period: "2026-10",
          expectedAmount: "19.70",
          currency: "EUR",
          status: "open",
        },
      ],
    });
    const rows = await fetchPayoutsOverview(
      "https://api.example/",
      "tok",
      communityId,
      undefined,
      fetchImpl as unknown as typeof fetch,
    );
    expect(rows).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.example/v1/communities/${communityId}/payouts-overview`,
      {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer tok",
        },
      },
    );
  });

  it("appends period query when provided", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    await fetchPayoutsOverview(
      "https://api.example",
      "tok",
      communityId,
      "2026-10",
      fetchImpl as unknown as typeof fetch,
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.example/v1/communities/${communityId}/payouts-overview?period=2026-10`,
      expect.any(Object),
    );
  });

  it("throws ApiError on failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(
      fetchPayoutsOverview(
        "https://api.example",
        "tok",
        communityId,
        undefined,
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
