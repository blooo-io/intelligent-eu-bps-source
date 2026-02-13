import { describe, expect, it } from "vitest";
import {
  readStripeEnv,
  resolvePspProvider,
  resolveStripeInvoiceProvider,
  toMinorUnits,
} from "./stripe-env.js";

describe("stripe-env (INT-189)", () => {
  it("reads OpenBao lowercase keys", () => {
    expect(
      readStripeEnv({
        stripe_secret_key: "sk_test_abc",
        stripe_webhook_secret: "whsec_a",
        stripe_connect_webhook_secret: "whsec_b",
      }),
    ).toEqual({
      secretKey: "sk_test_abc",
      webhookSecret: "whsec_a",
      connectWebhookSecret: "whsec_b",
    });
  });

  it("defaults to mock; only PSP_PROVIDER=stripe selects Stripe", () => {
    expect(resolvePspProvider({})).toBe("mock");
    expect(resolvePspProvider({ stripe_secret_key: "sk_test_x" })).toBe("mock");
    expect(resolvePspProvider({ PSP_PROVIDER: "stripe" })).toBe("stripe");
    expect(resolvePspProvider({ PSP_PROVIDER: "mock", stripe_secret_key: "sk_test_x" })).toBe(
      "mock",
    );
  });

  it("honours STRIPE_INVOICE_PROVIDER independently", () => {
    expect(resolveStripeInvoiceProvider({ STRIPE_INVOICE_PROVIDER: "stripe" })).toBe(
      "stripe",
    );
    expect(resolveStripeInvoiceProvider({})).toBe("mock");
  });

  it("converts decimal amounts to minor units", () => {
    expect(toMinorUnits("12.00")).toBe(1200);
    expect(toMinorUnits("2.5")).toBe(250);
    expect(() => toMinorUnits("nope")).toThrow(/Invalid amount/);
  });

  it("accepts STRIPE_* uppercase operator overrides", () => {
    expect(
      readStripeEnv({
        STRIPE_SECRET_KEY: "sk_test_up",
        STRIPE_WEBHOOK_SECRET: "whsec_up",
        STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_c",
      }),
    ).toEqual({
      secretKey: "sk_test_up",
      webhookSecret: "whsec_up",
      connectWebhookSecret: "whsec_c",
    });
    expect(readStripeEnv({})).toBeNull();
  });
});
