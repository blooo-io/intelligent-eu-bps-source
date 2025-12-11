import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { TermsPage } from "./terms-page";
import type { OidcFacade } from "../auth/oidc";
import type { WebConfig } from "../api/config";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
};

describe("TermsPage (INT-139 / UAT-062)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows terms and records acceptance with self-billing mandate", async () => {
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
          termsVersion: "1.0",
          text: "INTELLIGENT terms including self-billing.",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          termsVersion: "1.0",
          selfBillingMandate: true,
          acceptedAt: "2026-10-17T12:00:00.000Z",
        }),
      });
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <TermsPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/INTELLIGENT terms/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("checkbox", { name: /self-billing mandate/i }));
    fireEvent.click(screen.getByRole("button", { name: /accept terms/i }));

    await waitFor(() => {
      expect(screen.getByText(/Terms 1\.0 accepted/i)).toBeInTheDocument();
    });

    const postCall = fetchImpl.mock.calls.find(
      (c) =>
        typeof c[0] === "string" &&
        String(c[0]).endsWith("/v1/me/terms-acceptance"),
    );
    expect(postCall?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(postCall?.[1].body as string)).toEqual({
      termsVersion: "1.0",
      selfBillingMandate: true,
    });
  });
});
