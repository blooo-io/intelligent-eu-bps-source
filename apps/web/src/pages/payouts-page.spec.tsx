import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { PayoutsPage, payoutRefusalMessage } from "./payouts-page";
import { ApiError } from "../api/me";
import type { OidcFacade } from "../auth/oidc";
import type { WebConfig } from "../api/config";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
};

const participantId = "11111111-1111-1111-1111-111111111111";
const payoutId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("PayoutsPage (REQ-015 / UAT-015 / REQ-060)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("UAT-015: Withdraw posts the period and shows the payout status", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };

    let postBody: unknown;
    const fetchImpl = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/v1/me/payouts") && init?.method === "POST") {
        postBody = JSON.parse(String(init.body));
        return {
          ok: true,
          json: async () => ({
            payoutId,
            participantId,
            period: "2026-10",
            amount: "19.70",
            currency: "EUR",
            status: "in_transit",
            trigger: "participant",
            requestedAt: "2026-11-01T12:00:00Z",
          }),
        };
      }
      if (path.endsWith("/v1/me/payouts")) {
        return {
          ok: true,
          json: async () => ({
            items: postBody
              ? [
                  {
                    payoutId,
                    participantId,
                    period: "2026-10",
                    amount: "19.70",
                    currency: "EUR",
                    status: "in_transit",
                    trigger: "participant",
                    requestedAt: "2026-11-01T12:00:00Z",
                  },
                ]
              : [],
            withdrawable: postBody
              ? []
              : [{ period: "2026-10", amount: "19.70", currency: "EUR" }],
          }),
        };
      }
      return { ok: false, status: 404 };
    });
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <PayoutsPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Withdraw 19.70 EUR" }));
    await waitFor(() => expect(postBody).toEqual({ period: "2026-10" }));
    expect(await screen.findByText(/in transit/i)).toBeInTheDocument();
  });

  it("409 producer_invoices_unpaid is explained", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };

    const fetchImpl = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/v1/me/payouts") && init?.method === "POST") {
        return {
          ok: false,
          status: 409,
          json: async () => ({ reason: "producer_invoices_unpaid" }),
        };
      }
      if (path.endsWith("/v1/me/payouts")) {
        return {
          ok: true,
          json: async () => ({
            items: [],
            withdrawable: [{ period: "2026-10", amount: "19.70", currency: "EUR" }],
          }),
        };
      }
      return { ok: false, status: 404 };
    });
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <PayoutsPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Withdraw 19.70 EUR" }));
    expect(
      await screen.findByText(/some of your buyers have not paid yet/i),
    ).toBeInTheDocument();
  });

  it("maps other refusal reasons", () => {
    expect(
      payoutRefusalMessage(new ApiError(409, "x", "kyc_required")),
    ).toMatch(/verification/i);
    expect(
      payoutRefusalMessage(new ApiError(409, "x", "funds_pending")),
    ).toMatch(/not yet available/i);
    expect(
      payoutRefusalMessage(new ApiError(409, "x", "statement_not_found")),
    ).toMatch(/no statement/i);
    expect(
      payoutRefusalMessage(new ApiError(409, "x", "nothing_to_pay_out")),
    ).toMatch(/nothing to pay out/i);
  });
});
