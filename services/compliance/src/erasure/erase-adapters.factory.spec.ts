/**
 * REQ-013 / Task 3.21 — IdP/PSP erasure adapter selection.
 */
import { describe, expect, it, vi } from "vitest";
import { createEraseAdapters } from "./erase-adapters.factory.js";
import { HttpIdpEraseAdapter } from "../idp/http-idp-erase.adapter.js";
import { MockIdpAdapter } from "../idp/mock-idp.adapter.js";
import { HttpPspEraseAdapter } from "../psp/http-psp-erase.adapter.js";
import { MockPspEraseAdapter } from "../psp/mock-psp-erase.adapter.js";

describe("createEraseAdapters (REQ-013)", () => {
  it("REQ-013: http adapters selected when internal URLs set", () => {
    const adapters = createEraseAdapters({
      PARTICIPANTS_INTERNAL_URL: "http://participants:8080",
      PAYMENTS_INTERNAL_URL: "http://payments:8080",
    });
    expect(adapters.mode).toBe("http");
    expect(adapters.idp).toBeInstanceOf(HttpIdpEraseAdapter);
    expect(adapters.psp).toBeInstanceOf(HttpPspEraseAdapter);
  });

  it("REQ-013: ERASURE_ADAPTERS=http without URLs throws", () => {
    expect(() => createEraseAdapters({ ERASURE_ADAPTERS: "http" })).toThrow(
      /PARTICIPANTS_INTERNAL_URL|PAYMENTS_INTERNAL_URL/,
    );
  });

  it("REQ-013: ERASURE_ADAPTERS=mock forces mocks even with URLs", () => {
    const adapters = createEraseAdapters({
      ERASURE_ADAPTERS: "mock",
      PARTICIPANTS_INTERNAL_URL: "http://participants:8080",
      PAYMENTS_INTERNAL_URL: "http://payments:8080",
    });
    expect(adapters.mode).toBe("mock");
    expect(adapters.idp).toBeInstanceOf(MockIdpAdapter);
    expect(adapters.psp).toBeInstanceOf(MockPspEraseAdapter);
  });

  it("REQ-013: defaults to mock without URLs", () => {
    const adapters = createEraseAdapters({});
    expect(adapters.mode).toBe("mock");
  });
});

describe("HttpIdpEraseAdapter / HttpPspEraseAdapter (REQ-013)", () => {
  it("HttpIdpEraseAdapter POSTs erase-identity", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ erased: true }), { status: 200 }),
    );
    const adapter = new HttpIdpEraseAdapter(
      "http://participants:8080/",
      fetchImpl as never,
      "test-token",
    );
    const result = await adapter.erase({
      requestId: "r-1",
      participantId: "p-1",
    });
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://participants:8080/internal/v1/participants/p-1:erase-identity",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("HttpPspEraseAdapter POSTs erase-at-psp and returns outcome", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          outcome: "retained_by_psp",
          reason: "aml_legal_obligation",
        }),
        { status: 200 },
      ),
    );
    const adapter = new HttpPspEraseAdapter(
      "http://payments:8080",
      fetchImpl as never,
      "test-token",
    );
    const result = await adapter.erase({
      requestId: "r-1",
      participantId: "p-1",
    });
    expect(result).toMatchObject({
      ok: true,
      outcome: "retained_by_psp",
      reason: "aml_legal_obligation",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://payments:8080/internal/v1/payment-accounts/p-1:erase-at-psp",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
