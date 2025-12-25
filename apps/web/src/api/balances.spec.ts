import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./me";
import { createEarlySettlement, fetchMyBalances } from "./balances";

describe("balances API (REQ-057 / BR-05)", () => {
  it("lists balances", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          counterpartId: "33333333-3333-3333-3333-333333333333",
          amount: "12.50",
          currency: "EUR",
        },
      ],
    });
    const rows = await fetchMyBalances(
      "https://api.example/",
      "tok",
      fetchImpl as unknown as typeof fetch,
    );
    expect(rows).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith("https://api.example/v1/me/balances", {
      headers: {
        Accept: "application/json",
        Authorization: "Bearer tok",
      },
    });
  });

  it("posts early settlement for a producer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        runId: "44444444-4444-4444-4444-444444444444",
        communityId: "22222222-2222-2222-2222-222222222222",
        type: "early",
        status: "Completed",
        version: 1,
      }),
    });
    const run = await createEarlySettlement(
      "https://api.example",
      "tok",
      "33333333-3333-3333-3333-333333333333",
      fetchImpl as unknown as typeof fetch,
    );
    expect(run.type).toBe("early");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      producerId: "33333333-3333-3333-3333-333333333333",
    });
  });

  it("throws on failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    await expect(
      fetchMyBalances(
        "https://api.example",
        "tok",
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      createEarlySettlement(
        "https://api.example",
        "tok",
        "33333333-3333-3333-3333-333333333333",
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

