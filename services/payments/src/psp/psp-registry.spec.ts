/**
 * REQ-043 / UAT-054 — PSP registry selects test vs live adapters by mode.
 */
import { describe, expect, it } from "vitest";
import { MockPspAdapter } from "./mock-psp.adapter.js";
import {
  createPspRegistry,
  createTestPspRegistry,
  PspRegistry,
} from "./psp-registry.js";

describe("PspRegistry (REQ-043)", () => {
  it("REQ-043: live key must start with sk_live_", () => {
    // A test key in the live slot must not count as liveConfigured.
    const registry = createPspRegistry({
      PSP_PROVIDER: "stripe",
      stripe_secret_key: "sk_test_platform",
      stripe_webhook_secret: "whsec_test",
      stripe_live_secret_key: "sk_test_x",
    });
    expect(registry.capabilities()).toEqual({
      provider: "stripe",
      testConfigured: true,
      liveConfigured: false,
    });
    expect(() => registry.for("live")).toThrow(/live PSP not configured/);
  });

  it("REQ-043 / UAT-054: virtual community never uses live adapter", () => {
    const test = new MockPspAdapter();
    const live = new MockPspAdapter();
    const registry = createTestPspRegistry({ test, live, provider: "mock" });
    // Virtual mode always returns the test adapter instance.
    expect(registry.for("virtual")).toBe(test);
    expect(registry.for("virtual")).not.toBe(live);
  });

  it("REQ-043: liveConfigured when sk_live_ present", () => {
    const registry = createPspRegistry({
      PSP_PROVIDER: "stripe",
      stripe_secret_key: "sk_test_platform",
      stripe_webhook_secret: "whsec_test",
      stripe_live_secret_key: "sk_live_platform",
      stripe_live_webhook_secret: "whsec_live",
    });
    expect(registry.capabilities().liveConfigured).toBe(true);
    expect(registry.for("live")).not.toBe(registry.for("virtual"));
  });

  it("mock provider never exposes live", () => {
    const registry = createPspRegistry({ PSP_PROVIDER: "mock" });
    expect(registry).toBeInstanceOf(PspRegistry);
    expect(registry.capabilities()).toEqual({
      provider: "mock",
      testConfigured: true,
      liveConfigured: false,
    });
  });

  it("verifyWebhook carries livemode from the event", () => {
    const test = new MockPspAdapter();
    const registry = createTestPspRegistry({ test });
    const liveSigned = test.signEvent({
      kind: "payment.succeeded",
      pspPaymentRef: "mock_pay_1",
      livemode: true,
    });
    const verified = registry.verifyWebhook(
      liveSigned.rawBody,
      liveSigned.signature,
    );
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.livemode).toBe(true);
    }
  });
});
