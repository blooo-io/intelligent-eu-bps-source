import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { ManagerVerificationPage } from "./manager-verification-page";
import type { OidcFacade } from "../auth/oidc";
import type { WebConfig } from "../api/config";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
};

describe("ManagerVerificationPage (INT-429 / REQ-051)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("REQ-051: manager is redirected to the PSP-hosted identity URL", async () => {
    const assignLocation = vi.fn();
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        const path = String(url);
        if (path.endsWith("/v1/me/kyc")) {
          return {
            ok: true,
            json: async () => ({
              subjectId: "m1",
              subjectType: "manager",
              kycStatus: "none",
              kycVerified: false,
              method: "identity_document",
              updatedAt: "2026-11-24T12:00:00.000Z",
            }),
          };
        }
        if (path.endsWith("/v1/me/identity-verification") && init?.method === "POST") {
          return {
            ok: true,
            json: async () => ({
              verificationId: "vs_mgr_1",
              url: "https://verify.stripe.com/start/test_vs_mgr_1",
              status: "requires_input",
            }),
          };
        }
        return { ok: false, status: 404 };
      }),
    );

    render(
      <MemoryRouter initialEntries={["/manager/verification"]}>
        <Routes>
          <Route
            path="/manager/verification"
            element={
              <ManagerVerificationPage
                config={config}
                oidc={oidc}
                assignLocation={assignLocation}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(assignLocation).toHaveBeenCalledWith(
        "https://verify.stripe.com/start/test_vs_mgr_1",
      );
    });
  });
});
