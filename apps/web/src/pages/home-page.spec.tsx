import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { HomePage } from "./home-page";
import type { OidcFacade } from "../auth/oidc";
import type { WebConfig } from "../api/config";

vi.mock("@refinedev/core", () => ({
  useGetIdentity: () => ({
    data: { id: "u1", roles: ["member"], communityId: "c1" },
  }),
  useLogout: () => ({ mutate: vi.fn() }),
}));

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
};

describe("HomePage (INT-137 / REQ-049)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads /me and renders the readiness checklist", async () => {
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
          participantId: "11111111-1111-1111-1111-111111111111",
          communityId: "22222222-2222-2222-2222-222222222222",
          roles: ["member"],
          readiness: "TermsAccepted",
          profile: { name: "Ada", address: "1 Rue", email: "ada@example.com" },
        }),
      }),
    );

    render(
      <MemoryRouter>
        <HomePage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/TermsAccepted/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Complete payment setup/i)).toBeInTheDocument();
    expect(screen.getByText(/Roles from IdP: member/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /profile/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /terms/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /payment setup/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /balances/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /invoices/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /privacy/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /community settings/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /participants/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /billing runs/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /payments overview/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /reports/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /operator/i })).toBeInTheDocument();
  });

  it("shows an error when the access token is missing", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue(null),
    };

    render(
      <MemoryRouter>
        <HomePage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/No access token/i)).toBeInTheDocument();
    });
  });
});
