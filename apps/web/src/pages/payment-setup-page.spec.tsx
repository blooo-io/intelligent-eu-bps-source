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
  stripePublishableKey: "pk_test_fixture",
};

function meBody(
  role: "consumer" | "producer",
  readiness: "TermsAccepted" | "Ready" = "TermsAccepted",
) {
  return {
    participantId: "11111111-1111-1111-1111-111111111111",
    communityId: "22222222-2222-2222-2222-222222222222",
    roles: ["member"],
    role,
    readiness,
    profile: { name: "Ada", address: "1", email: "a@e.com" },
  };
}

describe("PaymentSetupPage (INT-140 / INT-191 / INT-252 / INT-254 / UAT-063)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("starts consumer elements mode with SetupIntent client secret (INT-193)", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        const path = String(url);
        if (path.endsWith("/v1/me")) {
          return { ok: true, json: async () => meBody("consumer") };
        }
        return {
          ok: true,
          json: async () => ({
            mode: "elements",
            status: "requirements_due",
            clientSecret: "seti_test_abc_secret_xyz",
          }),
        };
      }),
    );
    const loadStripe = vi.fn().mockResolvedValue({
      elements: vi.fn().mockReturnValue({
        create: vi.fn().mockReturnValue({
          mount: vi.fn(),
          unmount: vi.fn(),
        }),
      }),
      confirmSetup: vi.fn(),
    });

    render(
      <MemoryRouter>
        <PaymentSetupPage
          config={config}
          oidc={oidc}
          openUrl={vi.fn()}
          loadStripeSetup={loadStripe}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      // INT-254 — setup mockup title while not Ready.
      expect(
        screen.getByRole("heading", { name: /add a payment method/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /save card and finish/i }));
    await waitFor(() => {
      expect(screen.getByTestId("stripe-payment-element")).toBeInTheDocument();
    });
    expect(loadStripe).toHaveBeenCalledWith("pk_test_fixture");
  });

  it("mounts Stripe embedded Account onboarding and refreshes status on exit (INT-362 / REQ-051)", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };
    // Start returns an Account Session twice (mount, then expiry refresh), then complete.
    const sessions = [
      { mode: "embedded", status: "requirements_due", stripeAccountId: "acct_1", clientSecret: "accs_secret_1" },
      { mode: "embedded", status: "requirements_due", stripeAccountId: "acct_1", clientSecret: "accs_secret_2" },
      { mode: "embedded", status: "complete", stripeAccountId: "acct_1" },
    ];
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      const path = String(url);
      if (path.endsWith("/v1/me")) {
        return { ok: true, json: async () => meBody("producer") };
      }
      if (path.endsWith("/v1/me/payment-account")) {
        return { ok: true, json: async () => ({ status: "complete", stripeAccountId: "acct_1" }) };
      }
      const next = sessions.shift();
      return { ok: true, json: async () => next };
    });
    vi.stubGlobal("fetch", fetchImpl);

    // Fake Connect.js: a plain element with setOnExit, as the real one exposes.
    let onExit: (() => void) | undefined;
    let fetchClientSecret: (() => Promise<string>) | undefined;
    const loadConnect = vi.fn().mockImplementation(
      (params: { publishableKey: string; fetchClientSecret: () => Promise<string> }) => {
        fetchClientSecret = params.fetchClientSecret;
        return {
          create: vi.fn().mockImplementation(() => {
            const el = document.createElement("div");
            el.textContent = "stripe onboarding";
            Object.assign(el, { setOnExit: (cb: () => void) => { onExit = cb; } });
            return el;
          }),
        };
      },
    );

    render(
      <MemoryRouter>
        <PaymentSetupPage
          config={config}
          oidc={oidc}
          openUrl={vi.fn()}
          loadConnect={loadConnect as never}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      // INT-254 — producer setup mockup title while not Ready.
      expect(
        screen.getByRole("heading", { name: /open stripe connect/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByRole("button", { name: /continue to stripe connect/i }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("stripe-account-onboarding")).toHaveTextContent(
        "stripe onboarding",
      );
    });
    expect(loadConnect).toHaveBeenCalledWith(
      expect.objectContaining({ publishableKey: "pk_test_fixture" }),
    );
    // First secret comes from Start; the next one is minted through Start again.
    await expect(fetchClientSecret!()).resolves.toBe("accs_secret_1");
    await expect(fetchClientSecret!()).resolves.toBe("accs_secret_2");
    // No KYC form in the portal any more: Stripe collects everything.
    expect(screen.queryByLabelText(/bank account/i)).not.toBeInTheDocument();

    onExit!();
    await waitFor(() => {
      expect(screen.getByText(/payment account ready/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("stripe-account-onboarding")).not.toBeInTheDocument();
  });

  it("shows an error when onboarding fails", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (String(url).endsWith("/v1/me")) {
          return { ok: true, json: async () => meBody("consumer") };
        }
        return { ok: false, status: 500 };
      }),
    );

    render(
      <MemoryRouter>
        <PaymentSetupPage config={config} oidc={oidc} openUrl={vi.fn()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /save card and finish/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /save card and finish/i }));
    await waitFor(() => {
      expect(screen.getByText(/failed with 500/i)).toBeInTheDocument();
    });
  });

  it("uses Ready mockup title Payment method when consumer is Ready (INT-254)", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (String(url).endsWith("/v1/me")) {
          return { ok: true, json: async () => meBody("consumer", "Ready") };
        }
        if (String(url).endsWith("/v1/me/payment-account")) {
          return {
            ok: true,
            json: async () => ({
              status: "complete",
              brand: "visa",
              last4: "4242",
            }),
          };
        }
        return { ok: false, status: 500 };
      }),
    );

    render(
      <MemoryRouter>
        <PaymentSetupPage config={config} oidc={oidc} openUrl={vi.fn()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /^payment method$/i }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getAllByText(/card used when you pay open invoices/i).length,
    ).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.getByTestId("payment-method-ready")).toHaveTextContent(
        /Visa ···· 4242/,
      );
    });
    expect(screen.getByText(/Default for invoice pay/i)).toBeInTheDocument();
  });

  it("shows Open Stripe dashboard for Ready producer (INT-255)", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (String(url).endsWith("/v1/me")) {
          return { ok: true, json: async () => meBody("producer", "Ready") };
        }
        if (String(url).endsWith("/v1/me/payment-account")) {
          return {
            ok: true,
            json: async () => ({
              status: "complete",
              stripeAccountId: "acct_test_1",
              dashboardUrl:
                "https://dashboard.stripe.com/test/connect/accounts/acct_test_1",
            }),
          };
        }
        return { ok: false, status: 500 };
      }),
    );

    render(
      <MemoryRouter>
        <PaymentSetupPage config={config} oidc={oidc} openUrl={vi.fn()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /^payout account$/i }),
      ).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: /open stripe dashboard/i }),
      ).toHaveAttribute(
        "href",
        "https://dashboard.stripe.com/test/connect/accounts/acct_test_1",
      );
    });
  });
});
