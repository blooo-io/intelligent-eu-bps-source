/**
 * A7-bis — PspHandoff builders (INT-440).
 */
import { describe, expect, it } from "vitest";
import {
  embeddedHandoff,
  hostedHandoff,
  publishableKeyFromEnv,
} from "./psp-handoff.js";

describe("psp-handoff (A7-bis)", () => {
  it("publishableKeyFromEnv prefers STRIPE_PUBLISHABLE_KEY when valid", () => {
    expect(
      publishableKeyFromEnv({
        STRIPE_PUBLISHABLE_KEY: "pk_test_from_env",
        stripe_test_publishable_key: "pk_test_ignored",
      }),
    ).toBe("pk_test_from_env");
  });

  it("publishableKeyFromEnv accepts pk_live_ and falls back for junk", () => {
    expect(
      publishableKeyFromEnv({ stripe_publishable_key: "pk_live_abc" }),
    ).toBe("pk_live_abc");
    expect(publishableKeyFromEnv({ STRIPE_PUBLISHABLE_KEY: "sk_test_nope" })).toBe(
      "pk_test_mock_intelligent_ac07",
    );
  });

  it("hostedHandoff and embeddedHandoff include optional fields", () => {
    expect(hostedHandoff("checkout", "https://checkout.stripe.com/c/pay/x", "2099-01-01T00:00:00.000Z")).toMatchObject({
      surface: "hosted",
      purpose: "checkout",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    expect(
      embeddedHandoff("payment", {
        clientSecret: "pi_x_secret_test",
        publishableKey: "pk_test_custom",
        connectedAccountRef: "acct_prod",
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
    ).toMatchObject({
      surface: "embedded",
      purpose: "payment",
      clientSecret: "pi_x_secret_test",
      publishableKey: "pk_test_custom",
      connectedAccountRef: "acct_prod",
    });
  });
});
