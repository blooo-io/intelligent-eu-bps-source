import { describe, expect, it, vi } from "vitest";
import {
  createCommunitySettings,
  HttpCommunitySettings,
} from "./community-settings.port.js";

describe("community-settings port (INT-272)", () => {
  it("returns null without PARTICIPANTS_INTERNAL_URL", () => {
    expect(createCommunitySettings({})).toBeNull();
  });

  it("returns HttpCommunitySettings when PARTICIPANTS_INTERNAL_URL is set", () => {
    expect(
      createCommunitySettings({
        PARTICIPANTS_INTERNAL_URL: "http://participants:8080",
      }),
    ).toBeInstanceOf(HttpCommunitySettings);
  });

  it("HttpCommunitySettings maps Money/Rate strings", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        communityId: "c1",
        currency: "CHF",
        billingPeriod: "monthly",
        threshold: "7.50",
        vatRate: "0.08",
        billingMode: "virtual",
      }),
    );
    const client = new HttpCommunitySettings(
      "http://participants:8080",
      fetchImpl as never,
    );
    await expect(client.get("c1")).resolves.toEqual({
      currency: "CHF",
      threshold: 7.5,
      vatRate: 0.08,
      billingMode: "virtual",
      billingPeriod: "monthly",
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain(
      "/internal/v1/communities/c1/settings",
    );
    expect((init as RequestInit).headers).toMatchObject({
      "x-intelligent-roles": "service",
    });
  });

  it("HttpCommunitySettings defaults currency/mode and throws on error", async () => {
    const ok = new HttpCommunitySettings(
      "http://participants:8080/",
      vi.fn(async () => Response.json({})) as never,
    );
    await expect(ok.get("c1")).resolves.toEqual({
      currency: "EUR",
      threshold: 5,
      vatRate: 0,
      billingMode: "virtual",
      billingPeriod: "monthly",
    });

    const fail = new HttpCommunitySettings(
      "http://participants:8080",
      vi.fn(async () => new Response(null, { status: 500 })) as never,
    );
    await expect(fail.get("c1")).rejects.toThrow(/failed with 500/);
  });

  it("HttpCommunitySettings maps live billingMode", async () => {
    const client = new HttpCommunitySettings(
      "http://participants:8080",
      vi.fn(async () =>
        Response.json({
          currency: "EUR",
          threshold: 5,
          vatRate: 0,
          billingMode: "live",
          billingPeriod: "quarterly",
        }),
      ) as never,
    );
    await expect(client.get("c1")).resolves.toMatchObject({
      billingMode: "live",
      billingPeriod: "quarterly",
    });
  });
});
