import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./me";
import { createIdentityVerification, fetchMyKyc } from "./kyc";

describe("kyc API (REQ-051 / INT-429)", () => {
  it("GET /v1/me/kyc returns status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        subjectId: "m1",
        subjectType: "manager",
        kycStatus: "pending",
        kycVerified: false,
        method: "identity_document",
        updatedAt: "2026-11-24T12:00:00.000Z",
      }),
    });
    const status = await fetchMyKyc(
      "https://api.example/",
      "tok",
      fetchImpl as unknown as typeof fetch,
    );
    expect(status.kycVerified).toBe(false);
    expect(fetchImpl).toHaveBeenCalledWith("https://api.example/v1/me/kyc", {
      headers: {
        Accept: "application/json",
        Authorization: "Bearer tok",
      },
    });
  });

  it("POST /v1/me/identity-verification returns a hosted URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        verificationId: "vs_1",
        url: "https://verify.stripe.com/start/test_vs_1",
        status: "requires_input",
      }),
    });
    const session = await createIdentityVerification(
      "https://api.example",
      "tok",
      { returnUrl: "https://app.example/" },
      fetchImpl as unknown as typeof fetch,
    );
    expect(session.url).toMatch(/^https:\/\/verify\.stripe\.com\//);
    const call = fetchImpl.mock.calls[0];
    expect(call[0]).toBe("https://api.example/v1/me/identity-verification");
    expect(call[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(call[1].body as string)).toEqual({
      returnUrl: "https://app.example/",
    });
  });

  it("throws ApiError on failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(
      createIdentityVerification(
        "https://api.example",
        "tok",
        {},
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
