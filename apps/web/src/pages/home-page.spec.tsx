import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { HomePage } from "./home-page";
import type { OidcFacade } from "../auth/oidc";
import type { WebConfig } from "../api/config";

const { identityRoles } = vi.hoisted(() => ({
  identityRoles: vi.fn(() => ["member"]),
}));

vi.mock("@refinedev/core", () => ({
  useGetIdentity: () => ({
    data: {
      id: "u1",
      name: "Token Name",
      roles: identityRoles(),
      communityId: "c1",
    },
  }),
}));

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
};

describe("HomePage (INT-137 / INT-245 / REQ-049)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    identityRoles.mockReturnValue(["member"]);
  });

  it("loads /me and renders member readiness with a next action", async () => {
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
          role: "consumer",
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
      expect(screen.getByTestId("home-setup")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: /^home$/i })).toBeInTheDocument();
    expect(screen.getByText(/Complete payment setup/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /finish payment setup/i })).toBeInTheDocument();
    expect(screen.queryByText(/back to home/i)).not.toBeInTheDocument();
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

  it("shows manager shortcuts without the member checklist", async () => {
    identityRoles.mockReturnValue(["manager"]);
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
          roles: ["manager"],
          role: "prosumer",
          readiness: "Invited",
          profile: { name: "Mgr", address: "1", email: "m@e.com" },
        }),
      }),
    );

    render(
      <MemoryRouter>
        <HomePage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /community pulse/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/Manager shortcuts/i)).toBeInTheDocument();
    expect(screen.queryByTestId("home-setup")).toBeNull();
    expect(screen.getByRole("button", { name: /start billing run/i })).toBeInTheDocument();
  });

  it("uses /v1/me roles when the IdP token has none (INT-246)", async () => {
    identityRoles.mockReturnValue([]);
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
          role: "consumer",
          readiness: "Ready",
          profile: { name: "Ada", address: "1", email: "a@e.com" },
        }),
      }),
    );

    render(
      <MemoryRouter>
        <HomePage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /^home$/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /pay open invoices/i })).toBeInTheDocument();
    expect(screen.getByTestId("home-money")).toBeInTheDocument();
  });

  it("shows producer ready copy (INT-252)", async () => {
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
          participantId: "66666666-6666-6666-6666-666666666666",
          communityId: "22222222-2222-2222-2222-222222222222",
          roles: ["member"],
          role: "producer",
          readiness: "Ready",
          profile: { name: "Jordan", address: "1", email: "j@e.com" },
        }),
      }),
    );

    render(
      <MemoryRouter>
        <HomePage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /review open invoices/i }),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("home-money")).toHaveTextContent(/awaiting payment/i);
    expect(document.body.textContent).toMatch(/issued in your name \(self-billing\)/i);
  });

  it("shows operator desk copy", async () => {
    identityRoles.mockReturnValue(["operator"]);
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
          roles: ["operator"],
          role: "consumer",
          readiness: "Ready",
          profile: { name: "Ops", address: "1", email: "o@e.com" },
        }),
      }),
    );

    render(
      <MemoryRouter>
        <HomePage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /operator desk/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/Operator focus/i)).toBeInTheDocument();
  });
});
