import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./me";
import { acceptTerms, fetchCurrentTerms } from "./terms";

describe("terms API (REQ-050)", () => {
  it("fetches current terms with bearer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ termsVersion: "1.0", text: "Terms…" }),
    });
    const terms = await fetchCurrentTerms(
      "https://api.example/",
      "tok",
      fetchImpl as unknown as typeof fetch,
    );
    expect(terms.termsVersion).toBe("1.0");
    expect(fetchImpl).toHaveBeenCalledWith("https://api.example/v1/terms/current", {
      headers: {
        Accept: "application/json",
        Authorization: "Bearer tok",
      },
    });
  });

  it("posts acceptance including self-billing mandate", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        termsVersion: "1.0",
        selfBillingMandate: true,
        acceptedAt: "2026-10-17T12:00:00Z",
      }),
    });
    const result = await acceptTerms(
      "https://api.example",
      "tok",
      { termsVersion: "1.0", selfBillingMandate: true },
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.selfBillingMandate).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith("https://api.example/v1/me/terms-acceptance", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "Bearer tok",
      },
      body: JSON.stringify({ termsVersion: "1.0", selfBillingMandate: true }),
    });
  });

  it("throws ApiError on failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    await expect(
      fetchCurrentTerms(
        "https://api.example",
        "tok",
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      acceptTerms(
        "https://api.example",
        "tok",
        { termsVersion: "1.0", selfBillingMandate: false },
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

