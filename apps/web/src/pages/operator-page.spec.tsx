import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { OperatorPage } from "./operator-page";
import type { OidcFacade } from "../auth/oidc";
import type { WebConfig } from "../api/config";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
};

const communityId = "22222222-2222-2222-2222-222222222222";
const jobId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("OperatorPage (INT-149 / REQ-029 / REQ-041)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists anomalies, discrepancies and runs a job", async () => {
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
            roles: ["operator"],
            readiness: "Ready",
            profile: { name: "Op", address: "1", email: "o@e.com" },
          }),
        };
      }
      if (path.includes("/intake/anomalies")) {
        return {
          ok: true,
          json: async () => [
            { type: "unknown_party", marketId: "mkt-1", details: "seller missing" },
          ],
        };
      }
      if (path.includes("/reconciliation/discrepancies")) {
        return {
          ok: true,
          json: async () => [
            {
              scope: "market",
              expected: "10",
              actual: "9",
              status: "open",
            },
          ],
        };
      }
      if (path.includes("/v1/jobs") && path.includes(":run") && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            jobId,
            name: "StartRun",
            outcome: "Accepted",
          }),
        };
      }
      if (path.includes("/v1/jobs")) {
        return {
          ok: true,
          json: async () => [
            { jobId, name: "StartRun", outcome: "Idle", lastRunAt: "2026-10-01T00:00:00Z" },
          ],
        };
      }
      return { ok: false, status: 404 };
    });
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <OperatorPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/unknown_party/)).toBeInTheDocument();
    });
    expect(screen.getByText(/expected 10/)).toBeInTheDocument();
    expect(screen.getByText(/StartRun/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^run$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Job StartRun/)).toBeInTheDocument();
    });
    expect(
      fetchImpl.mock.calls.some(
        (c) => typeof c[0] === "string" && String(c[0]).includes(":run"),
      ),
    ).toBe(true);
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
        <OperatorPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/failed with 403/i)).toBeInTheDocument();
    });
  });

  it("shows an error when run fails", async () => {
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
            roles: ["operator"],
            readiness: "Ready",
            profile: { name: "Op", address: "1", email: "o@e.com" },
          }),
        };
      }
      if (path.includes("/intake/anomalies")) return { ok: true, json: async () => [] };
      if (path.includes("/reconciliation/discrepancies")) {
        return { ok: true, json: async () => [] };
      }
      if (path.includes(":run") && init?.method === "POST") {
        return { ok: false, status: 404 };
      }
      if (path.includes("/v1/jobs")) {
        return {
          ok: true,
          json: async () => [{ jobId, name: "Reconcile" }],
        };
      }
      return { ok: false, status: 404 };
    });
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <OperatorPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Reconcile/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^run$/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed with 404/i)).toBeInTheDocument();
    });
  });
});
