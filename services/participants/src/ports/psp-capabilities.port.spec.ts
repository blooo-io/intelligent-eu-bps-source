/**
 * REQ-043 — PSP capabilities port selects HTTP vs no-live stub.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createPspCapabilities,
  HttpPspCapabilities,
  NoLivePspCapabilities,
} from "./psp-capabilities.port.js";

describe("PspCapabilitiesPort (REQ-043)", () => {
  it("uses NoLive when PAYMENTS_INTERNAL_URL unset", () => {
    const port = createPspCapabilities({});
    expect(port).toBeInstanceOf(NoLivePspCapabilities);
  });

  it("uses HTTP when PAYMENTS_INTERNAL_URL set", () => {
    const port = createPspCapabilities({
      PAYMENTS_INTERNAL_URL: "http://payments:8080",
    });
    expect(port).toBeInstanceOf(HttpPspCapabilities);
  });

  it("NoLive reports liveConfigured false", async () => {
    const port = new NoLivePspCapabilities();
    await expect(port.get()).resolves.toMatchObject({ liveConfigured: false });
  });

  it("HTTP maps liveConfigured from AC-07", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        provider: "stripe",
        testConfigured: true,
        liveConfigured: true,
      }),
    );
    const port = new HttpPspCapabilities(
      "http://payments.invalid",
      fetchImpl as unknown as typeof fetch,
    );
    await expect(port.get()).resolves.toEqual({
      provider: "stripe",
      testConfigured: true,
      liveConfigured: true,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://payments.invalid/internal/v1/psp/capabilities",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
