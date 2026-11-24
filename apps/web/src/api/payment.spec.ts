import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  attachMyPaymentMethod,
  createPaymentOnboarding,
  fetchMyPaymentAccount,
  followHostedCheckoutUrl,
} from "./payment";
import { payInvoice } from "./invoices";

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
          pspAccountRef: "acct_1",
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

  it("GETs Ready payment account brand/last4 (INT-255)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "complete",
          brand: "visa",
          last4: "4242",
        }),
      }),
    );
    const account = await fetchMyPaymentAccount("https://api.example", "tok");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example/v1/me/payment-account",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      }),
    );
    expect(account).toEqual({
      status: "complete",
      brand: "visa",
      last4: "4242",
    });
  });

  it("surfaces HTTP errors from payment-account APIs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    await expect(fetchMyPaymentAccount("https://api.example/", "tok")).rejects.toThrow(
      /503/,
    );
    await expect(createPaymentOnboarding("https://api.example", "tok")).rejects.toThrow(
      /503/,
    );
    await expect(
      attachMyPaymentMethod("https://api.example", "tok", "pm_1"),
    ).rejects.toThrow(/503/);
  });
});

describe("payInvoice hosted checkout (REQ-014 / UAT-014)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const P = "66666666-6666-6666-6666-666666666666";
  const I = "55555555-5555-5555-5555-555555555555";

  it("UAT-014 payInvoice follows the PSP-hosted checkoutUrl for SEPA", async () => {
    const navigate = vi.fn();
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        paymentId: P,
        invoiceId: I,
        amount: "42.50",
        currency: "EUR",
        status: "requires_action",
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_1",
      }),
    });
    await payInvoice("https://api.example", "tok", I, {
      fetchImpl: fetchMock as unknown as typeof fetch,
      returnUrl: "https://app.example/invoices",
      navigate,
    });
    expect(navigate).toHaveBeenCalledWith(
      "https://checkout.stripe.com/c/pay/cs_1",
    );
  });

  it("does not navigate when checkoutUrl is missing or non-https", () => {
    const navigate = vi.fn();
    expect(followHostedCheckoutUrl(undefined, navigate)).toBe(false);
    expect(followHostedCheckoutUrl("http://insecure.example/pay", navigate)).toBe(
      false,
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(
      followHostedCheckoutUrl("https://checkout.stripe.com/c/pay/cs_ok", navigate),
    ).toBe(true);
    expect(navigate).toHaveBeenCalledWith(
      "https://checkout.stripe.com/c/pay/cs_ok",
    );
  });
});
