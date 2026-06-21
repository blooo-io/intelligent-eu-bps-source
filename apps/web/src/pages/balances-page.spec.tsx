import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("BalancesPage (INT-141 / UAT-074)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists balances and settles early with a producer", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { counterpartId: producerId, amount: "12.50", currency: "EUR" },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          runId: "44444444-4444-4444-4444-444444444444",
          communityId: "22222222-2222-2222-2222-222222222222",
          type: "early",
          status: "Completed",
          version: 1,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
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

    fireEvent.click(screen.getByRole("button", { name: /settle early|settle now/i }));

    await waitFor(() => {
      expect(screen.getByText(/Early settlement run/i)).toBeInTheDocument();
    });

    const post = fetchImpl.mock.calls.find(
      (c) =>
        typeof c[0] === "string" && String(c[0]).endsWith("/v1/early-settlements"),
    );
    expect(JSON.parse(post?.[1].body as string)).toEqual({ producerId });
  });
});
