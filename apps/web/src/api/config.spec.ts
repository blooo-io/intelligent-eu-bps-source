import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig, resetConfigCache } from "./config";

describe("loadConfig", () => {
  afterEach(() => {
    resetConfigCache();
  });

  it("loads runtime /config.json when present", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        oidcAuthority: "https://auth.example/realms/int",
        oidcClientId: "web",
        apiBaseUrl: "https://api.example",
      }),
    });

    const cfg = await loadConfig(fetchImpl as unknown as typeof fetch);
    expect(cfg.oidcAuthority).toBe("https://auth.example/realms/int");
    expect(cfg.apiBaseUrl).toBe("https://api.example");
    expect(fetchImpl).toHaveBeenCalledWith("/config.json", {
      credentials: "same-origin",
    });
  });

  it("falls back to defaults when /config.json is missing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false });
    const cfg = await loadConfig(fetchImpl as unknown as typeof fetch);
    expect(cfg.oidcClientId).toBe("web");
    expect(cfg.oidcAuthority).toContain("realms/int");
  });

  it("memoises the first successful load", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ apiBaseUrl: "https://once.example" }),
    });
    await loadConfig(fetchImpl as unknown as typeof fetch);
    await loadConfig(fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back when fetch throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    const cfg = await loadConfig(fetchImpl as unknown as typeof fetch);
    expect(cfg.oidcClientId).toBe("web");
  });
});
