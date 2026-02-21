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

describe("PaymentSetupPage (INT-140 / INT-190 / UAT-063)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("starts consumer link mode and opens Stripe setup URL", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };
    const openUrl = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          mode: "link",
          status: "requirements_due",
          url: "https://checkout.stripe.com/c/pay/setup_abc",
        }),
      }),
    );

    render(
      <MemoryRouter>
        <PaymentSetupPage config={config} oidc={oidc} openUrl={openUrl} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /start payment setup/i }));
    await waitFor(() => {
      expect(openUrl).toHaveBeenCalledWith(
        "https://checkout.stripe.com/c/pay/setup_abc",
      );
    });
    expect(
      screen.getByRole("link", { name: /open stripe payment-method setup/i }),
    ).toHaveAttribute("href", "https://checkout.stripe.com/c/pay/setup_abc");
  });

  it("shows in-platform KYC form for producer requirements (INT-190)", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mode: "requirements",
          status: "requirements_due",
          stripeAccountId: "acct_1",
          currentlyDue: ["business_type", "tos_acceptance.date"],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mode: "requirements",
          status: "complete",
          stripeAccountId: "acct_1",
          currentlyDue: [],
        }),
      });
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <PaymentSetupPage config={config} oidc={oidc} openUrl={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /start payment setup/i }));
    await waitFor(() => {
      expect(screen.getByText(/outstanding/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/business profile url/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /continue to stripe/i })).toBeNull();

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
      target: { value: "1 Example St" },
    });
    fireEvent.change(screen.getByLabelText(/^city/i), {
      target: { value: "Berlin" },
    });
    fireEvent.change(screen.getByLabelText(/postal code/i), {
      target: { value: "10115" },
    });
    fireEvent.change(screen.getByLabelText(/bank account/i), {
      target: { value: "DE89370400440532013000" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /submit kyc/i }));

    await waitFor(() => {
      expect(screen.getByText(/payment account ready/i)).toBeInTheDocument();
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("shows an error when onboarding fails", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    render(
      <MemoryRouter>
        <PaymentSetupPage config={config} oidc={oidc} openUrl={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /start payment setup/i }));
    await waitFor(() => {
      expect(screen.getByText(/failed with 500/i)).toBeInTheDocument();
    });
  });
});
