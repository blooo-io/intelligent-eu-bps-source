import { describe, expect, it } from "vitest";
import { MockPspAdapter } from "./mock-psp.adapter.js";
import { resolvePspProvider } from "./stripe-env.js";
import { StripePspAdapter } from "./stripe-psp.adapter.js";

describe("PSP provider factory (INT-189 / AD-6)", () => {
  it("selects MockPspAdapter unless PSP_PROVIDER=stripe", () => {
    const mock = new MockPspAdapter();
    const pick = (env: NodeJS.ProcessEnv) =>
      resolvePspProvider(env) === "stripe"
        ? new StripePspAdapter({
            secretKey: "sk_test_factory",
            webhookSecret: "whsec_x",
            connectWebhookSecret: "",
          })
        : mock;

    expect(pick({})).toBe(mock);
    expect(pick({ PSP_PROVIDER: "stripe" })).toBeInstanceOf(StripePspAdapter);
  });
});
