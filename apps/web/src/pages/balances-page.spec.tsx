import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { BalancesPage } from "./balances-page";
import type { OidcFacade } from "../auth/oidc";
import type { WebConfig } from "../api/config";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
};

const producerId = "33333333-3333-3333-3333-333333333333";

describe("BalancesPage (INT-141 / REQ-056)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("REQ-056: lists carried balances without a settle action", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { counterpartId: producerId, amount: "12.50", currency: "EUR" },
      ],
    });
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <BalancesPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/12\.50 EUR/)).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("button", { name: /settle early|settle now/i }),
    ).toBeNull();
    expect(screen.getByText(/carries forward/i)).toBeInTheDocument();
  });
});
