import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { PayoutsOverviewPage } from "./payouts-overview-page";
import type { OidcFacade } from "../auth/oidc";
import type { WebConfig } from "../api/config";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
};

const communityId = "22222222-2222-2222-2222-222222222222";

describe("PayoutsOverviewPage (REQ-060 / UAT-077)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("UAT-077: manager sees one row per participant with completed/open", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };

    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      const path = String(url);
      if (path.endsWith("/v1/me")) {
        return {
          ok: true,
          json: async () => ({
            participantId: "11111111-1111-1111-1111-111111111111",
            communityId,
            roles: ["manager"],
            role: "consumer",
            readiness: "Ready",
            profile: { name: "Mgr", address: "1", email: "m@e.com" },
          }),
        };
      }
      if (path.endsWith(`/v1/communities/${communityId}/payouts-overview`)) {
        return {
          ok: true,
          json: async () => [
            {
              participantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
              period: "2026-10",
              expectedAmount: "19.70",
              currency: "EUR",
              status: "completed",
              paidOutAmount: "19.70",
            },
            {
              participantId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
              period: "2026-10",
              expectedAmount: "4.80",
              currency: "EUR",
              status: "open",
            },
            {
              participantId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
              period: "2026-10",
              expectedAmount: "12.00",
              currency: "EUR",
              status: "open",
            },
          ],
        };
      }
      return { ok: false, status: 404 };
    });
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <PayoutsOverviewPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    // Ant Design table: header row + 3 data rows (UAT-077).
    await waitFor(() => {
      expect(screen.getAllByRole("row")).toHaveLength(4);
    });
    expect(screen.getAllByText("completed").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("open").length).toBeGreaterThanOrEqual(1);
  });

  it("shows an error when load fails", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403 }),
    );

    render(
      <MemoryRouter>
        <PayoutsOverviewPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/do not have access/i)).toBeInTheDocument();
    });
  });
});
