import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { CommunitySettingsPage } from "./community-settings-page";
import type { OidcFacade } from "../auth/oidc";
import type { WebConfig } from "../api/config";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
};

const communityId = "22222222-2222-2222-2222-222222222222";

describe("CommunitySettingsPage (INT-144 / REQ-006 / REQ-043 / REQ-056)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads settings and saves currency, period, threshold, VAT and mode", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };

    const fetchImpl = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/v1/me")) {
        return {
          ok: true,
          json: async () => ({
            participantId: "11111111-1111-1111-1111-111111111111",
            communityId,
            roles: ["manager"],
            readiness: "Ready",
            profile: { name: "Mgr", address: "1 Rue", email: "mgr@example.com" },
          }),
        };
      }
      if (
        path.endsWith(`/v1/communities/${communityId}/settings`) &&
        (!init?.method || init.method === "GET")
      ) {
        return {
          ok: true,
          json: async () => ({
            communityId,
            currency: "EUR",
            billingPeriod: "monthly",
            threshold: "5.00",
            vatRate: "0.00",
            billingMode: "virtual",
          }),
        };
      }
      if (
        path.endsWith(`/v1/communities/${communityId}/settings`) &&
        init?.method === "PUT"
      ) {
        return {
          ok: true,
          json: async () => ({
            communityId,
            ...JSON.parse(init.body as string),
          }),
        };
      }
      return { ok: false, status: 404 };
    });
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <CommunitySettingsPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("EUR")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("5.00")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("5.00"), {
      target: { value: "10.00" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => {
      expect(screen.getByText(/Settings saved/i)).toBeInTheDocument();
    });

    const putCall = fetchImpl.mock.calls.find(
      (c) =>
        typeof c[0] === "string" &&
        String(c[0]).endsWith(`/v1/communities/${communityId}/settings`) &&
        c[1]?.method === "PUT",
    );
    expect(JSON.parse(putCall?.[1].body as string)).toEqual({
      currency: "EUR",
      billingPeriod: "monthly",
      threshold: "10.00",
      vatRate: "0.00",
      billingMode: "virtual",
    });
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
        <CommunitySettingsPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("access-notice")).toBeInTheDocument();
    });
    expect(screen.getByText(/need a manager role/i)).toBeInTheDocument();
    expect(screen.queryByText(/failed with 403/i)).toBeNull();
  });
});
