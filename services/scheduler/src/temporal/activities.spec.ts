import { afterEach, describe, expect, it, vi } from "vitest";
import { invokeOwnerModule } from "./activities.js";

describe("invokeOwnerModule (INT-216)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OWNER_BASE_URL_TEMPLATE;
    delete process.env.OWNER_BASE_URL_AC_05;
  });

  it("POSTs the job body to the owning module internal API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 202,
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await invokeOwnerModule({
      ownerModule: "AC-05",
      path: "/billing-runs",
      method: "POST",
      body: { communityId: "c1", type: "periodic" },
    });
    expect(result).toEqual({ status: 202 });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://settlement:8080/internal/v1/billing-runs",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          // INT-287 — ModuleAuthGuard reads x-intelligent-* (not x-principal-*).
          "x-intelligent-roles": "service",
          "x-intelligent-sub": "ac-14-scheduler",
          "x-intelligent-token-use": "service",
        }),
        body: JSON.stringify({ communityId: "c1", type: "periodic" }),
      }),
    );
  });

  it("honours OWNER_BASE_URL_TEMPLATE", async () => {
    process.env.OWNER_BASE_URL_TEMPLATE = "http://{host}.svc:8080";
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);
    await invokeOwnerModule({
      ownerModule: "settlement",
      path: "/billing-runs",
      method: "POST",
      body: {},
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://settlement.svc:8080/internal/v1/billing-runs",
      expect.any(Object),
    );
  });

  it("throws on non-OK owner responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        text: async () => "unavailable",
      })),
    );
    await expect(
      invokeOwnerModule({
        ownerModule: "AC-05",
        path: "/billing-runs",
        method: "POST",
        body: {},
      }),
    ).rejects.toThrow(/owner_http_503/);
  });
});
