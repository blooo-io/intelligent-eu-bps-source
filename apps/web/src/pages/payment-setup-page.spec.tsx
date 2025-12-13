import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { PaymentSetupPage } from "./payment-setup-page";
import type { OidcFacade } from "../auth/oidc";
import type { WebConfig } from "../api/config";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
};

describe("PaymentSetupPage (INT-140 / UAT-063)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("requests an onboarding link and opens Stripe (no card fields)", async () => {
    const openUrl = vi.fn();
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
        json: async () => ({ url: "https://connect.stripe.com/setup/test_abc" }),
      }),
    );

    render(
      <MemoryRouter>
        <PaymentSetupPage config={config} oidc={oidc} openUrl={openUrl} />
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText(/card/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/card number/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /continue to stripe/i }));

    await waitFor(() => {
      expect(openUrl).toHaveBeenCalledWith("https://connect.stripe.com/setup/test_abc");
    });
    expect(screen.getByRole("link", { name: /open stripe onboarding/i })).toHaveAttribute(
      "href",
      "https://connect.stripe.com/setup/test_abc",
    );
  });
});
