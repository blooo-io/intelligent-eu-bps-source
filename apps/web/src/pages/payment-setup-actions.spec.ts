import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import {
  attachPaymentMethodOnboarding,
  refreshOnboardingClientSecret,
  startPaymentOnboarding,
} from "./payment-setup-actions";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
};

function oidcWithToken(token: string | null): OidcFacade {
  return {
    login: vi.fn(),
    handleCallback: vi.fn(),
    logout: vi.fn(),
    getUser: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue(token),
  };
}

describe("payment-setup-actions (INT-362)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("starts link onboarding and opens the hosted URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          mode: "link",
          status: "requirements_due",
          url: "https://connect.stripe.example/onboard",
        }),
      }),
    );
    const openUrl = vi.fn();
    const onComplete = vi.fn();
    const { session, account } = await startPaymentOnboarding({
      config,
      oidc: oidcWithToken("tok"),
      openUrl,
      onComplete,
    });
    expect(session.mode).toBe("link");
    expect(openUrl).toHaveBeenCalledWith("https://connect.stripe.example/onboard");
    expect(onComplete).not.toHaveBeenCalled();
    expect(account).toBeNull();
  });

  it("refreshes the account summary when onboarding completes", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).endsWith("/onboarding")) {
        return {
          ok: true,
          json: async () => ({ mode: "requirements", status: "complete" }),
        };
      }
      return {
        ok: true,
        json: async () => ({ status: "complete", brand: "visa", last4: "4242" }),
      };
    });
    vi.stubGlobal("fetch", fetchImpl);
    const onComplete = vi.fn();
    const { account } = await startPaymentOnboarding({
      config,
      oidc: oidcWithToken("tok"),
      openUrl: vi.fn(),
      onComplete,
    });
    expect(onComplete).toHaveBeenCalled();
    expect(account).toMatchObject({ brand: "visa", last4: "4242" });
  });

  it("ignores account summary failures after complete onboarding", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (String(url).endsWith("/onboarding")) {
          return {
            ok: true,
            json: async () => ({ mode: "requirements", status: "complete" }),
          };
        }
        return { ok: false, status: 503 };
      }),
    );
    const { account } = await startPaymentOnboarding({
      config,
      oidc: oidcWithToken("tok"),
      openUrl: vi.fn(),
    });
    expect(account).toBeNull();
  });

  it("requires a token to start onboarding", async () => {
    await expect(
      startPaymentOnboarding({
        config,
        oidc: oidcWithToken(null),
        openUrl: vi.fn(),
      }),
    ).rejects.toThrow(/access token/i);
  });

  it("fires onComplete after attaching a payment method", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ mode: "elements", status: "complete" }),
      }),
    );
    const onComplete = vi.fn();
    const session = await attachPaymentMethodOnboarding({
      config,
      oidc: oidcWithToken("tok"),
      paymentMethodId: "pm_card_visa",
      onComplete,
    });
    expect(session.status).toBe("complete");
    expect(onComplete).toHaveBeenCalled();
  });

  it("requires a token to attach a payment method", async () => {
    await expect(
      attachPaymentMethodOnboarding({
        config,
        oidc: oidcWithToken(null),
        paymentMethodId: "pm_card_visa",
      }),
    ).rejects.toThrow(/access token/i);
  });

  it("returns an embedded client secret for Connect onboarding", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          mode: "embedded",
          status: "requirements_due",
          clientSecret: "acs_test_secret",
        }),
      }),
    );
    await expect(
      refreshOnboardingClientSecret({
        config,
        oidc: oidcWithToken("tok"),
      }),
    ).resolves.toBe("acs_test_secret");
  });

  it("rejects non-embedded onboarding sessions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          mode: "link",
          status: "requirements_due",
          url: "https://connect.example",
        }),
      }),
    );
    await expect(
      refreshOnboardingClientSecret({
        config,
        oidc: oidcWithToken("tok"),
      }),
    ).rejects.toThrow(/unavailable/i);
  });

  it("requires a token to refresh the client secret", async () => {
    await expect(
      refreshOnboardingClientSecret({
        config,
        oidc: oidcWithToken(null),
      }),
    ).rejects.toThrow(/access token/i);
  });
});