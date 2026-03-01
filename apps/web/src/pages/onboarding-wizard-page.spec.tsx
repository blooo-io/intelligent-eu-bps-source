import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { OnboardingWizardPage } from "./onboarding-wizard-page";
import type { OidcFacade } from "../auth/oidc";
import type { WebConfig } from "../api/config";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
  stripePublishableKey: "pk_test_fixture",
};

function renderWizard(initial = "/onboarding") {
  const oidc: OidcFacade = {
    login: vi.fn(),
    handleCallback: vi.fn(),
    logout: vi.fn(),
    getUser: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue("tok"),
  };
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/onboarding"
          element={<OnboardingWizardPage config={config} oidc={oidc} />}
        />
        <Route path="/" element={<div>Home body</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OnboardingWizardPage (INT-193 / UAT-067)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads readiness and opens the profile step when Invited", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          participantId: "p1",
          communityId: "c1",
          readiness: "Invited",
          profile: { name: "", address: "", email: "" },
        }),
      }),
    );
    renderWizard();
    await waitFor(() => {
      expect(screen.getByText(/Get ready/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Invited/)).toBeInTheDocument();
    expect(screen.getByText(/Billing identity/i)).toBeInTheDocument();
  });

  it("advances to payment step when TermsAccepted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          participantId: "p1",
          communityId: "c1",
          readiness: "TermsAccepted",
          profile: { name: "A", address: "B", email: "a@b.co" },
        }),
      }),
    );
    renderWizard("/onboarding?step=payment");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /start payment setup/i })).toBeInTheDocument();
    });
  });

  it("shows pay step when Ready", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (String(url).includes("/me/invoices")) {
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            participantId: "p1",
            communityId: "c1",
            readiness: "Ready",
            profile: { name: "A", address: "B", email: "a@b.co" },
          }),
        });
      }),
    );
    renderWizard("/onboarding?step=pay");
    await waitFor(() => {
      expect(screen.getByText(/You are Ready/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /finish/i }));
    await waitFor(() => {
      expect(screen.getByText("Home body")).toBeInTheDocument();
    });
  });

  it("shows an error when /me fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    renderWizard();
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});
