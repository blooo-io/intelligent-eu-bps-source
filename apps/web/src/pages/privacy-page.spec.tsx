import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { PrivacyPage } from "./privacy-page";
import type { OidcFacade } from "../auth/oidc";
import type { WebConfig } from "../api/config";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
};

const requestId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const participantId = "11111111-1111-1111-1111-111111111111";

describe("PrivacyPage (INT-143 / UAT-013)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("submits an erasure request and refreshes status", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };

    const fetchImpl = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/v1/data-subject-requests") && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            requestId,
            participantId,
            type: "erasure",
            status: "Accepted",
          }),
        };
      }
      if (path.endsWith(`/v1/data-subject-requests/${requestId}`)) {
        return {
          ok: true,
          json: async () => ({
            requestId,
            participantId,
            type: "erasure",
            status: "Completed",
          }),
        };
      }
      return { ok: false, status: 404 };
    });
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <PrivacyPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("radio", { name: /erasure/i }));
    fireEvent.click(screen.getByRole("button", { name: /request export|request erasure|submit request/i }));

    await waitFor(() => {
      expect(screen.getByTestId("privacy-request-status")).toBeInTheDocument();
      expect(screen.getByText(/Accepted/)).toBeInTheDocument();
    });

    const postCall = fetchImpl.mock.calls.find(
      (c) =>
        typeof c[0] === "string" &&
        String(c[0]).endsWith("/v1/data-subject-requests") &&
        c[1]?.method === "POST",
    );
    expect(JSON.parse(postCall?.[1].body as string)).toEqual({ type: "erasure" });

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

    await waitFor(() => {
      expect(screen.getByText(/Completed/)).toBeInTheDocument();
    });
  });

  it("shows an error when create fails", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400 }),
    );

    render(
      <MemoryRouter>
        <PrivacyPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /request export|request erasure|submit request/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed with 400/i)).toBeInTheDocument();
    });
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
        <PrivacyPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /request export|request erasure|submit request/i }));

    await waitFor(() => {
      expect(screen.getByText(/No access token/i)).toBeInTheDocument();
    });
  });

  it("shows an error when refresh fails", async () => {
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
          requestId,
          participantId,
          type: "export",
          status: "Accepted",
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <PrivacyPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /request export|request erasure|submit request/i }));
    await waitFor(() => {
      expect(screen.getByText(/Accepted/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => {
      expect(screen.getByText(/failed with 404/i)).toBeInTheDocument();
    });
  });
});
