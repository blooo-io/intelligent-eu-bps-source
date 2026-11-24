import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IdentitySetupPanel } from "./identity-setup-panel";
import type { OidcFacade } from "../auth/oidc";
import type { WebConfig } from "../api/config";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
  stripePublishableKey: "pk_test_fixture",
};

describe("IdentitySetupPanel (INT-429 / REQ-051)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("starts Connect embedded KYC for any participant role", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          mode: "embedded",
          status: "requirements_due",
          clientSecret: "accs_secret",
          pspAccountRef: "acct_1",
        }),
      }),
    );
    const loadConnect = vi.fn().mockImplementation(
      (params: { publishableKey: string; fetchClientSecret: () => Promise<string> }) => ({
        create: vi.fn().mockImplementation(() => {
          const el = document.createElement("div");
          el.textContent = "stripe onboarding";
          Object.assign(el, { setOnExit: vi.fn() });
          void params.fetchClientSecret();
          return el;
        }),
      }),
    );

    render(
      <IdentitySetupPanel
        config={config}
        oidc={oidc}
        loadConnect={loadConnect as never}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /continue to identity verification/i }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("stripe-account-onboarding")).toHaveTextContent(
        "stripe onboarding",
      );
    });
  });

  it("shows an error when onboarding start fails", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    render(<IdentitySetupPanel config={config} oidc={oidc} />);
    fireEvent.click(
      screen.getByRole("button", { name: /continue to identity verification/i }),
    );
    expect(
      await screen.findByText(/request failed|failed|error/i),
    ).toBeInTheDocument();
  });

  it("flags non-embedded incomplete sessions as unavailable", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          mode: "hosted",
          status: "requirements_due",
          url: "https://connect.stripe.com/setup/s/test",
          pspAccountRef: "acct_1",
        }),
      }),
    );

    render(<IdentitySetupPanel config={config} oidc={oidc} />);
    fireEvent.click(
      screen.getByRole("button", { name: /continue to identity verification/i }),
    );
    expect(
      await screen.findByText("Identity verification session unavailable"),
    ).toBeInTheDocument();
  });
});
