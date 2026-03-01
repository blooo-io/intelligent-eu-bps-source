import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  attachMyPaymentMethod,
  createPaymentOnboarding,
  submitPaymentOnboardingRequirements,
} from "./payment";

describe("createPaymentOnboarding (REQ-051 / INT-190)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs and returns a requirements session for producers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          mode: "requirements",
          status: "requirements_due",
          stripeAccountId: "acct_1",
          currentlyDue: ["business_type"],
        }),
      }),
    );
    const session = await createPaymentOnboarding("https://api.example", "tok");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example/v1/me/payment-account/onboarding",
      expect.objectContaining({ method: "POST" }),
    );
    expect(session.mode).toBe("requirements");
    expect(session.currentlyDue).toContain("business_type");
  });

  it("submits KYC requirements", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          mode: "requirements",
          status: "complete",
          stripeAccountId: "acct_1",
          currentlyDue: [],
        }),
      }),
    );
    const session = await submitPaymentOnboardingRequirements(
      "https://api.example",
      "tok",
      { businessType: "individual", tosAccepted: true },
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example/v1/me/payment-account/onboarding/requirements",
      expect.objectContaining({ method: "POST" }),
    );
    expect(session.status).toBe("complete");
  });

  it("attaches consumer payment method (INT-193)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ mode: "elements", status: "complete" }),
      }),
    );
    const session = await attachMyPaymentMethod(
      "https://api.example",
      "tok",
      "pm_card_visa",
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example/v1/me/payment-account/payment-method",
      expect.objectContaining({ method: "POST" }),
    );
    expect(session.status).toBe("complete");
  });
});
