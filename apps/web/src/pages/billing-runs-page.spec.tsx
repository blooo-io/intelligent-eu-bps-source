import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { BillingRunsPage } from "./billing-runs-page";
import type { OidcFacade } from "../auth/oidc";
import type { WebConfig } from "../api/config";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
};

const communityId = "22222222-2222-2222-2222-222222222222";
const runId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("BillingRunsPage (INT-146 / UAT-006)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("starts a periodic run and refreshes status", async () => {
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
            profile: { name: "Mgr", address: "1", email: "m@e.com" },
          }),
        };
      }
      if (path.includes("/billing-runs") && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            runId,
            communityId,
            type: "periodic",
            period: "2026-09",
            status: "Collecting",
            version: 1,
          }),
        };
      }
      if (path.endsWith(`/v1/billing-runs/${runId}`)) {
        return {
          ok: true,
          json: async () => ({
            runId,
            communityId,
            type: "periodic",
            period: "2026-09",
            status: "Completed",
            version: 2,
          }),
        };
      }
      return { ok: false, status: 404 };
    });
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <BillingRunsPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("billing-runs-community-help")).toHaveTextContent(
        communityId,
      );
    });
    expect(screen.getByTestId("billing-runs-community-help")).toHaveTextContent(
      /billing tenancy/i,
    );

    fireEvent.change(screen.getByLabelText(/Billing period/i), {
      target: { value: "2026-09" },
    });
    fireEvent.click(screen.getByRole("button", { name: /start run/i }));

    await waitFor(() => {
      expect(screen.getByText(/Collecting/)).toBeInTheDocument();
    });

    const postCall = fetchImpl.mock.calls.find(
      (c) =>
        typeof c[0] === "string" &&
        String(c[0]).includes("/billing-runs") &&
        c[1]?.method === "POST",
    );
    expect(JSON.parse(postCall?.[1].body as string)).toEqual({
      type: "periodic",
      period: "2026-09",
    });

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

    await waitFor(() => {
      expect(screen.getByText(/Completed/)).toBeInTheDocument();
    });
  });

  it("shows an error when me load fails", async () => {
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
        <BillingRunsPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/do not have access/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/failed with 403/i)).toBeNull();
  });

  it("shows an error when the access token is missing on start", async () => {
    const getAccessToken = vi
      .fn()
      .mockResolvedValueOnce("tok")
      .mockResolvedValueOnce(null);
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          participantId: "11111111-1111-1111-1111-111111111111",
          communityId,
          roles: ["manager"],
          readiness: "Ready",
          profile: { name: "Mgr", address: "1", email: "m@e.com" },
        }),
      }),
    );

    render(
      <MemoryRouter>
        <BillingRunsPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(new RegExp(communityId))).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Billing period/i), {
      target: { value: "2026-09" },
    });
    fireEvent.click(screen.getByRole("button", { name: /start run/i }));

    await waitFor(() => {
      expect(screen.getByText(/No access token/i)).toBeInTheDocument();
    });
  });

  it("shows an error when start fails and when refresh fails", async () => {
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
        json: async () => ({
          participantId: "11111111-1111-1111-1111-111111111111",
          communityId,
          roles: ["manager"],
          readiness: "Ready",
          profile: { name: "Mgr", address: "1", email: "m@e.com" },
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 400 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          runId,
          communityId,
          type: "early",
          status: "Collecting",
          version: 1,
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <BillingRunsPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(new RegExp(communityId))).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("radio", { name: /^early$/i }));

    fireEvent.click(screen.getByRole("button", { name: /start run/i }));
    await waitFor(() => {
      expect(screen.getByText(/failed with 400/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /start run/i }));
    await waitFor(() => {
      expect(screen.getByText(/Collecting/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeInTheDocument();
    });
  });
});
