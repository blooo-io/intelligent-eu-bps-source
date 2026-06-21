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

  it("tokenizes KYC with Stripe.js then submits accountToken (INT-191)", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };
    const fetchImpl = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/v1/me")) {
        return { ok: true, json: async () => meBody("producer") };
      }
      if (path.includes("/onboarding/requirements") && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            mode: "requirements",
            status: "complete",
            stripeAccountId: "acct_1",
            currentlyDue: [],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          mode: "requirements",
          status: "requirements_due",
          currentlyDue: ["business_type", "tos_acceptance.date"],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchImpl);
    const loadStripe = vi.fn().mockResolvedValue({
      createToken: vi.fn().mockResolvedValue({ token: { id: "ct_from_js" } }),
    });

    render(
      <MemoryRouter>
        <PaymentSetupPage
          config={config}
          oidc={oidc}
          openUrl={vi.fn()}
          loadStripe={loadStripe}
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
      expect(screen.getByText(/outstanding/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/business profile url/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/business profile url/i), {
      target: { value: "https://producer.example" },
    });
    fireEvent.change(screen.getByLabelText(/^first name/i), {
      target: { value: "Ada" },
    });
    fireEvent.change(screen.getByLabelText(/^last name/i), {
      target: { value: "Lovelace" },
    });
    fireEvent.change(screen.getByLabelText(/^email/i), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^address/i), {
      target: { value: "1 Rue Example" },
    });
    fireEvent.change(screen.getByLabelText(/^city/i), {
      target: { value: "Paris" },
    });
    fireEvent.change(screen.getByLabelText(/postal code/i), {
      target: { value: "75001" },
    });
    fireEvent.change(screen.getByLabelText(/bank account/i), {
      target: { value: "FR1420041010050500013M02606" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /submit kyc/i }));

    await waitFor(() => {
      expect(screen.getByText(/payment account ready/i)).toBeInTheDocument();
    });
    expect(loadStripe).toHaveBeenCalledWith("pk_test_fixture");
    const submitCall = fetchImpl.mock.calls.find(
      (c) => String(c[0]).includes("/onboarding/requirements"),
    );
    expect(submitCall).toBeTruthy();
    const body = JSON.parse(submitCall![1].body as string);
    expect(body.accountToken).toBe("ct_from_js");
    expect(body.country).toBe("FR");
    // INT-195 — DOB defaults (1902-01-01) and identity doc go into the Account Token.
    expect(body.representative.dob).toEqual({ day: 1, month: 1, year: 1902 });
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
