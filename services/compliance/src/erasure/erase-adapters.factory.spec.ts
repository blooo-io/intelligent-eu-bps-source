/**
 * REQ-013 / Task 3.21 / INT-463 — IdP/PSP erasure adapter selection.
 */
import { describe, expect, it, vi } from "vitest";
import { createEraseAdapters } from "./erase-adapters.factory.js";
import { DelegatedProjectUiIdpEraseAdapter } from "../idp/delegated-project-ui-idp-erase.adapter.js";
import { MockIdpAdapter } from "../idp/mock-idp.adapter.js";
import { HttpPspEraseAdapter } from "../psp/http-psp-erase.adapter.js";
import { MockPspEraseAdapter } from "../psp/mock-psp-erase.adapter.js";

describe("createEraseAdapters (REQ-013 / INT-463)", () => {
  it("INT-463: http mode uses delegated IdP + HTTP PSP", () => {
    const adapters = createEraseAdapters({
      PARTICIPANTS_INTERNAL_URL: "http://participants:8080",
      PAYMENTS_INTERNAL_URL: "http://payments:8080",
    });
    expect(adapters.mode).toBe("http");
    expect(adapters.idp).toBeInstanceOf(DelegatedProjectUiIdpEraseAdapter);
    expect(adapters.psp).toBeInstanceOf(HttpPspEraseAdapter);
  });

  it("REQ-013: ERASURE_ADAPTERS=http without PAYMENTS_INTERNAL_URL throws", () => {
    expect(() => createEraseAdapters({ ERASURE_ADAPTERS: "http" })).toThrow(
      /PAYMENTS_INTERNAL_URL/,
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

  it("INT-440: mock fallback refused when NODE_ENV=production", () => {
    expect(() => createEraseAdapters({ NODE_ENV: "production" })).toThrow(
      /NODE_ENV=production/,
    );
  });

  it("INT-440: ERASURE_ADAPTERS=mock refused when NODE_ENV=production", () => {
    expect(() =>
      createEraseAdapters({
        NODE_ENV: "production",
        ERASURE_ADAPTERS: "mock",
        PAYMENTS_INTERNAL_URL: "http://payments:8080",
      }),
    ).toThrow(/ERASURE_ADAPTERS=mock refused/);
  });

  it("INT-463: delegated IdP erase does not call the network", async () => {
    const adapters = createEraseAdapters({
      PAYMENTS_INTERNAL_URL: "http://payments:8080",
    });
    const result = await adapters.idp.erase({
      requestId: "r-1",
      participantId: "p-1",
    });
    expect(result).toEqual({
      ok: true,
      requestId: "r-1",
      participantId: "p-1",
      outcome: "delegated_to_project_ui",
    });
  });
});

describe("HttpPspEraseAdapter (REQ-013)", () => {
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
