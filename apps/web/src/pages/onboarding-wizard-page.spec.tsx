import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { OnboardingWizardPage } from "./onboarding-wizard-page";
import { wizardStepItems } from "./onboarding-wizard-step-model";
import type { OidcFacade } from "../auth/oidc";
import type { WebConfig } from "../api/config";
import type { Me } from "../api/me";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
  stripePublishableKey: "pk_test_fixture",
};

function meFixture(
  readiness: string,
  overrides: Partial<Me> = {},
): Me {
  return {
    participantId: "p1",
    communityId: "c1",
    roles: ["member"],
    role: "consumer",
    readiness: readiness as Me["readiness"],
    profile: { name: "A", address: "B", email: "a@b.co" },
    kycVerified: false,
    ...overrides,
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

describe("OnboardingWizardPage (INT-193 / UAT-067 / INT-429)", () => {
  // Nested Ant Design pages under coverage regularly exceed Vitest's 5s default on CI.
  const slow = 15_000;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("REQ-051: consumer wizard shows Identity step before Pay", () => {
    const items = wizardStepItems(
      meFixture("Invited", { role: "consumer" }),
      "profile",
    );
    expect(items.map((i) => i.title)).toEqual([
      "Profile",
      "Terms",
      "Identity",
      "Pay",
    ]);
  });

  it("REQ-051: producer wizard has no card step", () => {
    const items = wizardStepItems(
      meFixture("Invited", { role: "producer" }),
      "profile",
    );
    expect(items.map((i) => i.title)).toEqual([
      "Profile",
      "Terms",
      "Identity",
    ]);
  });

  it(
    "REQ-050: Terms step shows self-billing mandate only for producer/prosumer",
    async () => {
      const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
        const path = String(url);
        if (path.endsWith("/v1/me")) {
          return {
            ok: true,
            json: async () =>
              meFixture("ProfileCompleted", { role: "consumer" }),
          };
        }
        if (path.includes("/terms")) {
          return {
            ok: true,
            json: async () => ({
              termsVersion: "1.0",
              text: "Consumer terms without self-billing gate.",
            }),
          };
        }
        return { ok: false, status: 404 };
      });
      vi.stubGlobal("fetch", fetchImpl);
      renderWizard("/onboarding?step=terms");
      await waitFor(
        () => {
          expect(
            screen.getByText(/Consumer terms without self-billing/i),
          ).toBeInTheDocument();
        },
        { timeout: 10_000 },
      );
      expect(
        screen.queryByRole("checkbox", { name: /self-billing mandate/i }),
      ).toBeNull();

      // Prosumer must see the mandate.
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string) => {
          const path = String(url);
          if (path.endsWith("/v1/me")) {
            return {
              ok: true,
              json: async () =>
                meFixture("ProfileCompleted", { role: "prosumer" }),
            };
          }
          if (path.includes("/terms")) {
            return {
              ok: true,
              json: async () => ({
                termsVersion: "1.0",
                text: "Prosumer terms with self-billing.",
              }),
            };
          }
          return { ok: false, status: 404 };
        }),
      );
      renderWizard("/onboarding?step=terms");
      await waitFor(
        () => {
          expect(
            screen.getByRole("checkbox", { name: /self-billing mandate/i }),
          ).toBeInTheDocument();
        },
        { timeout: 10_000 },
      );
    },
    slow,
  );

  it(
    "loads readiness and opens the profile step when Invited",
    async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () =>
            meFixture("Invited", {
              profile: { name: "", address: "", email: "" },
            }),
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
    "opens identity step when TermsAccepted and KYC is incomplete",
    async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => meFixture("TermsAccepted", { kycVerified: false }),
        }),
      );
      renderWizard("/onboarding?step=identity");
      await waitFor(
        () => {
          expect(
            screen.getByRole("button", {
              name: /continue to identity verification/i,
            }),
          ).toBeInTheDocument();
        },
        { timeout: 10_000 },
      );
    },
    slow,
  );

  it(
    "advances to payment step when TermsAccepted and KYC is done",
    async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => meFixture("TermsAccepted", { kycVerified: true }),
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
            json: async () =>
              meFixture("Ready", { kycVerified: true }),
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
            screen.getByRole("heading", { name: /Get ready — step 4 of 4/i }),
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
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => meFixture("ProfileCompleted"),
      });
      vi.stubGlobal("fetch", fetchMock);
      renderWizard("/onboarding?step=profile");
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
    "Continue to identity on terms step refreshes readiness",
    async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () =>
            meFixture("TermsAccepted", { kycVerified: false }),
        }),
      );
      renderWizard("/onboarding?step=terms");
      await waitFor(
        () => {
          expect(
            screen.getByRole("button", { name: /continue to identity/i }),
          ).toBeInTheDocument();
        },
        { timeout: 10_000 },
      );
      fireEvent.click(
        screen.getByRole("button", { name: /continue to identity/i }),
      );
      await waitFor(
        () => {
          expect(
            screen.getByRole("button", {
              name: /continue to identity verification/i,
            }),
          ).toBeInTheDocument();
        },
        { timeout: 10_000 },
      );
    },
    slow,
  );

  it("disables Continue until the current gate is done (ANO-001 / ANO-010)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          meFixture("Invited", {
            profile: { name: "", address: "", email: "" },
          }),
      }),
    );
    renderWizard();
    const profileContinue = await screen.findByRole("button", {
      name: /continue to terms/i,
    });
    expect(profileContinue).toBeDisabled();
    await waitFor(() => {
      expect(screen.getByText(/invitation does not include a name/i)).toBeInTheDocument();
    });
  });

  it(
    "afterGate surfaces refresh errors",
    async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => meFixture("ProfileCompleted"),
        })
        .mockResolvedValue({ ok: false, status: 503 });
      vi.stubGlobal("fetch", fetchMock);
      renderWizard("/onboarding?step=profile");
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

  it("prosumer wizard includes Identity and Pay", () => {
    const items = wizardStepItems(
      meFixture("Invited", { role: "prosumer" }),
      "profile",
    );
    expect(items.map((i) => i.title)).toEqual([
      "Profile",
      "Terms",
      "Identity",
      "Pay",
    ]);
  });
});
