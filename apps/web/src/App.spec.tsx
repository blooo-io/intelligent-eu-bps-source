import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { App } from "./App";
import type { OidcFacade } from "./auth/oidc";
import type { WebConfig } from "./api/config";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
};

describe("App shell", () => {
  it("renders the login route when unauthenticated", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn().mockResolvedValue(null),
      getAccessToken: vi.fn().mockResolvedValue(null),
    };

    // Authenticated redirects to /login; start on a protected path via history.
    window.history.pushState({}, "", "/login");

    render(<App config={config} oidc={oidc} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sign in with idp/i })).toBeInTheDocument();
    });
  });
});
