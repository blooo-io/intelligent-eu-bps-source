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
      expect(screen.getByText(/set up payment/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: /your billing home/i })).toBeInTheDocument();
    expect(screen.getByText(/Complete payment setup/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /finish payment setup/i })).toBeInTheDocument();
    expect(screen.getByTestId("home-who")).toHaveTextContent(/Ada/);
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
      expect(screen.getByRole("heading", { name: /community console/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/Manager shortcuts/i)).toBeInTheDocument();
    expect(screen.queryByText(/Get ready/i)).toBeNull();
    expect(
      screen.getByRole("button", { name: /open community settings/i }),
    ).toBeInTheDocument();
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
      expect(screen.getByRole("heading", { name: /your billing home/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /view invoices/i })).toBeInTheDocument();
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
