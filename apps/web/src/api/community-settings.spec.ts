import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./me";
import { fetchCommunitySettings, putCommunitySettings } from "./community-settings";

const communityId = "22222222-2222-2222-2222-222222222222";
const settings = {
  communityId,
  currency: "EUR",
  billingPeriod: "monthly",
  threshold: "5.00",
  vatRate: "0.00",
  billingMode: "virtual" as const,
};

describe("community-settings API (REQ-006 / REQ-043 / REQ-056)", () => {
  it("fetches settings with bearer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => settings,
    });
    const result = await fetchCommunitySettings(
      "https://api.example/",
      "tok",
      communityId,
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.threshold).toBe("5.00");
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.example/v1/communities/${communityId}/settings`,
      {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer tok",
        },
      },
    );
  });

  it("puts settings body without communityId", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...settings, threshold: "10.00" }),
    });
    const body = {
      currency: "EUR",
      billingPeriod: "monthly",
      threshold: "10.00",
      vatRate: "0.00",
      billingMode: "virtual" as const,
    };
    const result = await putCommunitySettings(
      "https://api.example",
      "tok",
      communityId,
      body,
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.threshold).toBe("10.00");
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.example/v1/communities/${communityId}/settings`,
      {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer tok",
        },
        body: JSON.stringify(body),
      },
    );
  });

  it("throws ApiError on failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(
      fetchCommunitySettings(
        "https://api.example",
        "tok",
        communityId,
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      putCommunitySettings(
        "https://api.example",
        "tok",
        communityId,
        {
          currency: "EUR",
          billingPeriod: "monthly",
          threshold: "5.00",
          vatRate: "0.00",
          billingMode: "virtual",
        },
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
