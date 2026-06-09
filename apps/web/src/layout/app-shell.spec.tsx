import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { AppShell } from "./app-shell";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";

const identity = vi.fn();

vi.mock("@refinedev/core", () => ({
  useLogout: () => ({ mutate: vi.fn() }),
  useGetIdentity: () => ({ data: identity() }),
}));

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
};

function renderShell(
  path: string,
  roles: string[],
  me?: {
    readiness: string;
    profile: { name: string; address: string; email: string };
    communityId: string;
  },
) {
  identity.mockReturnValue({
    id: "sub-1",
    name: "Test User",
    roles,
    communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
  });

  const oidc: OidcFacade = {
    login: vi.fn(),
    handleCallback: vi.fn(),
    logout: vi.fn(),
    getUser: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue("tok"),
  };

  if (me) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          participantId: "11111111-1111-1111-1111-111111111111",
          communityId: me.communityId,
          roles,
          readiness: me.readiness,
          profile: me.profile,
        }),
      }),
    );
  }

  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell config={config} oidc={oidc} />}>
          <Route index element={<div>Home body</div>} />
          <Route path="invoices" element={<div>Invoices body</div>} />
          <Route path="community-settings" element={<div>Settings body</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppShell (INT-187 / INT-243)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    identity.mockReset();
  });

  it("shows identity in the header", async () => {
    renderShell("/", ["member"], {
      readiness: "Ready",
      profile: { name: "S1 Consumer", address: "1", email: "c@e.com" },
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
    });

    expect(screen.getByText("INTELLIGENT billing")).toBeInTheDocument();
    expect(screen.getByTestId("shell-user-name")).toBeInTheDocument();
    expect(screen.getByTestId("shell-user-roles")).toHaveTextContent(/member/i);
    await waitFor(() => {
      expect(screen.getByTestId("shell-user-name")).toHaveTextContent("S1 Consumer");
    });
    // INT-250 — S1 maps to a human label; raw UUID never shown.
    expect(
      screen.queryByText(/c0ffee00-1234-4abc-8def-0123456789ab/i),
    ).toBeNull();
    await waitFor(() => {
      expect(screen.getByTestId("shell-community")).toHaveTextContent(
        /Demo community S1/i,
      );
    });
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("hides manager screens from members", async () => {
    renderShell("/", ["member"], {
      readiness: "Ready",
      profile: { name: "Member", address: "1", email: "m@e.com" },
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
    });

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /^home$/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /invoices/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /community settings/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /billing runs/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^operator$/i })).toBeNull();
  });

  it("shows manager community screens for managers", async () => {
    renderShell("/", ["manager"], {
      readiness: "Invited",
      profile: { name: "Mgr", address: "1", email: "mgr@e.com" },
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
    });

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /^settings$/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /billing runs/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^members$/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /get ready/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /operator tools/i })).toBeNull();
  });

  it("highlights the active route in the sider", async () => {
    renderShell("/invoices", ["member"], {
      readiness: "Ready",
      profile: { name: "Member", address: "1", email: "m@e.com" },
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
    });

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /invoices/i })).toBeInTheDocument();
    });
    const invoices = screen.getByRole("link", { name: /invoices/i });
    expect(invoices.closest("li")?.className ?? "").toMatch(/ant-menu-item-selected/);
  });

  it("falls back to /v1/me roles when the token has none (INT-246)", async () => {
    identity.mockReturnValue({
      id: "sub-1",
      name: "UAT Member",
      roles: [],
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
    });
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
          communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
          roles: ["member"],
          readiness: "Ready",
          profile: { name: "UAT Member", address: "1", email: "u@e.com" },
        }),
      }),
    );

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<AppShell config={config} oidc={oidc} />}>
            <Route index element={<div>Home body</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("shell-user-roles")).toHaveTextContent(/member/i);
    });
    expect(screen.getByRole("link", { name: /invoices/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^settings$/i })).toBeNull();
  });
});
