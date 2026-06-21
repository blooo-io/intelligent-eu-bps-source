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

function meFixture(
  readiness: string,
  profile = { name: "A", address: "B", email: "a@b.co" },
) {
  return {
    participantId: "p1",
    communityId: "c1",
    roles: ["member"],
    role: "consumer" as const,
    readiness,
    profile,
  };
}

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
  // Nested Ant Design pages under coverage regularly exceed Vitest's 5s default on CI.
  const slow = 15_000;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it(
    "loads readiness and opens the profile step when Invited",
    async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () =>
            meFixture("Invited", { name: "", address: "", email: "" }),
        }),
      );
      renderWizard();
      await waitFor(
        () => {
          expect(screen.getByText(/Get ready/i)).toBeInTheDocument();
        },
        { timeout: 10_000 },
      );
      expect(screen.getByText(/Invited/)).toBeInTheDocument();
      expect(screen.getByText(/Billing identity/i)).toBeInTheDocument();
      // INT-211 — nested ProfilePage must not add a second PageFrame heading.
      await waitFor(
        () => {
          expect(
            screen.getByRole("button", { name: /save profile/i }),
          ).toBeInTheDocument();
        },
        { timeout: 10_000 },
      );
      expect(screen.queryByRole("heading", { name: /^billing profile$/i })).toBeNull();
    },
    slow,
  );

  it(
    "advances to payment step when TermsAccepted",
    async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => meFixture("TermsAccepted"),
        }),
      );
      renderWizard("/onboarding?step=payment");
      await waitFor(
        () => {
          expect(
            screen.getByRole("button", {
              name: /save card and finish|start payment setup/i,
            }),
          ).toBeInTheDocument();
        },
        { timeout: 10_000 },
      );
    },
    slow,
  );

  it(
    "shows Ready payment step with money unlock CTA (INT-255)",
    async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string) => {
          if (String(url).includes("/me/invoices")) {
            return Promise.resolve({ ok: true, json: async () => [] });
          }
          return Promise.resolve({
            ok: true,
            json: async () => meFixture("Ready"),
          });
        }),
      );
      render(
        <MemoryRouter initialEntries={["/onboarding?step=payment"]}>
          <Routes>
            <Route
              path="/onboarding"
              element={<OnboardingWizardPage config={config} oidc={{
                login: vi.fn(),
                handleCallback: vi.fn(),
                logout: vi.fn(),
                getUser: vi.fn(),
                getAccessToken: vi.fn().mockResolvedValue("tok"),
              }} />}
            />
            <Route path="/invoices" element={<div>Invoices body</div>} />
          </Routes>
        </MemoryRouter>,
      );
      await waitFor(
        () => {
          expect(
            screen.getByRole("heading", { name: /Get ready — step 3 of 3/i }),
          ).toBeInTheDocument();
        },
        { timeout: 10_000 },
      );
      expect(screen.getByText(/You are ready/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /go to invoices/i }));
      await waitFor(
        () => {
          expect(screen.getByText("Invoices body")).toBeInTheDocument();
        },
        { timeout: 10_000 },
      );
    },
    slow,
  );

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

  it(
    "Continue to terms reloads readiness via afterGate (INT-194)",
    async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () =>
            meFixture("Invited", { name: "", address: "", email: "" }),
        })
        // ProfilePage + terms/current noise may call more; then afterGate reload.
        .mockResolvedValue({
          ok: true,
          json: async () => meFixture("ProfileCompleted"),
        });
      vi.stubGlobal("fetch", fetchMock);
      renderWizard();
      await waitFor(
        () => {
          expect(
            screen.getByRole("button", { name: /continue to terms/i }),
          ).toBeInTheDocument();
        },
        { timeout: 10_000 },
      );
      fireEvent.click(screen.getByRole("button", { name: /continue to terms/i }));
      await waitFor(
        () => {
          expect(
            screen.getByText(/Profile saved — accept the terms/i),
          ).toBeInTheDocument();
        },
        { timeout: 10_000 },
      );
    },
    slow,
  );

  it(
    "Continue to payment setup on terms step refreshes readiness",
    async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => meFixture("ProfileCompleted"),
        }),
      );
      renderWizard("/onboarding?step=terms");
      await waitFor(
        () => {
          expect(
            screen.getByRole("button", { name: /continue to payment setup/i }),
          ).toBeInTheDocument();
        },
        { timeout: 10_000 },
      );
      fireEvent.click(
        screen.getByRole("button", { name: /continue to payment setup/i }),
      );
      await waitFor(
        () => {
          expect(
            screen.getByText(/Profile saved — accept the terms/i),
          ).toBeInTheDocument();
        },
        { timeout: 10_000 },
      );
    },
    slow,
  );

  it(
    "afterGate surfaces refresh errors",
    async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () =>
            meFixture("Invited", { name: "", address: "", email: "" }),
        })
        .mockResolvedValue({ ok: false, status: 503 });
      vi.stubGlobal("fetch", fetchMock);
      renderWizard();
      await waitFor(
        () => {
          expect(
            screen.getByRole("button", { name: /continue to terms/i }),
          ).toBeInTheDocument();
        },
        { timeout: 10_000 },
      );
      fireEvent.click(screen.getByRole("button", { name: /continue to terms/i }));
      // INT-199 — wizard Alert and nested ProfilePage may both surface the 503.
      await waitFor(
        () => {
          expect(screen.getAllByText(/failed|503|Refresh/i).length).toBeGreaterThan(0);
        },
        { timeout: 10_000 },
      );
    },
    slow,
  );
});
