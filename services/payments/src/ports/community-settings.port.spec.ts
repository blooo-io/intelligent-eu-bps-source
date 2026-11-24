import { describe, expect, it, vi } from "vitest";
import {
  createCommunitySettings,
  HttpCommunitySettings,
  InMemoryCommunitySettings,
} from "./community-settings.port.js";

describe("CommunitySettingsPort (REQ-015)", () => {
  it("InMemoryCommunitySettings defaults autoPayout to false and keeps put values until reset", async () => {
    const mem = new InMemoryCommunitySettings();
    expect(await mem.get("c1")).toEqual({ autoPayout: false });
    mem.put("c1", { autoPayout: true });
    expect(await mem.get("c1")).toEqual({ autoPayout: true });
    expect(await mem.get("c2")).toEqual({ autoPayout: false });
    mem.reset();
    expect(await mem.get("c1")).toEqual({ autoPayout: false });
  });

  it("createCommunitySettings picks HTTP only when PARTICIPANTS_INTERNAL_URL is set", () => {
    const mem = new InMemoryCommunitySettings();
    expect(createCommunitySettings({}, mem)).toBe(mem);
    expect(
      createCommunitySettings({ PARTICIPANTS_INTERNAL_URL: "http://participants:8080" }, mem),
    ).toBeInstanceOf(HttpCommunitySettings);
  });

  it("HttpCommunitySettings GETs AC-03 GetCommunitySettings and keeps autoPayout", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        communityId: "c1",
        currency: "EUR",
        billingPeriod: "monthly",
        threshold: "5.00",
        vatRate: "0",
        billingMode: "virtual",
        autoPayout: true,
      }),
    );
    const http = new HttpCommunitySettings("http://participants:8080/", fetchImpl as never, "svc-token");
    await expect(http.get("c1")).resolves.toEqual({ autoPayout: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://participants:8080/internal/v1/communities/c1/settings",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer svc-token",
          "x-intelligent-roles": "service",
        }),
      }),
    );
  });

  it("HttpCommunitySettings treats a missing or non-boolean autoPayout as false", async () => {
    const http = new HttpCommunitySettings(
      "http://participants:8080",
      vi.fn(async () => Response.json({ autoPayout: "yes" })) as never,
      "tok",
    );
    await expect(http.get("c1")).resolves.toEqual({ autoPayout: false });
  });

  it("HttpCommunitySettings throws on non-OK", async () => {
    const http = new HttpCommunitySettings(
      "http://participants:8080",
      vi.fn(async () => new Response(null, { status: 404 })) as never,
      "tok",
    );
    await expect(http.get("c1")).rejects.toThrow(/failed with 404/);
  });
});
