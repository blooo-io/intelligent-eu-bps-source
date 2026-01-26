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

function unauthenticatedOidc(): OidcFacade {
  return {
    login: vi.fn(),
    handleCallback: vi.fn(),
    logout: vi.fn(),
    getUser: vi.fn().mockResolvedValue(null),
    getAccessToken: vi.fn().mockResolvedValue(null),
  };
}

describe("App shell", () => {
  it("renders the login route when unauthenticated", async () => {
    window.history.pushState({}, "", "/login");

    render(<App config={config} oidc={unauthenticatedOidc()} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sign in with idp/i })).toBeInTheDocument();
    });
  });

  it("redirects unauthenticated / to /login (INT-181 / UAT-043)", async () => {
    // Regression: without routerProvider, Authenticated's useGo is a no-op
    // and `/` renders a blank page while `/login` still works.
    window.history.pushState({}, "", "/");

    render(<App config={config} oidc={unauthenticatedOidc()} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sign in with idp/i })).toBeInTheDocument();
    });
    expect(window.location.pathname).toBe("/login");
  });
});
