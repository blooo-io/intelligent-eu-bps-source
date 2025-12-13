import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./me";
import { createPaymentOnboarding } from "./payment";

describe("createPaymentOnboarding (REQ-051)", () => {
  it("POSTs and returns the Stripe onboarding URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://connect.stripe.com/setup/test_123" }),
    });
    const link = await createPaymentOnboarding(
      "https://api.example/",
      "tok",
      fetchImpl as unknown as typeof fetch,
    );
    expect(link.url).toContain("stripe.com");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example/v1/me/payment-account/onboarding",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer tok",
        },
      },
    );
  });

  it("throws ApiError on failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(
      createPaymentOnboarding(
        "https://api.example",
        "tok",
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
