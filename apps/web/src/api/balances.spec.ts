import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./me";
import { fetchMyBalances } from "./balances";

describe("balances API (REQ-056)", () => {
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

  it("throws on failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    await expect(
      fetchMyBalances(
        "https://api.example",
        "tok",
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
