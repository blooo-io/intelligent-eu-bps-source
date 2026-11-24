import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { StatementsPage } from "./statements-page";
import type { OidcFacade } from "../auth/oidc";
import type { WebConfig } from "../api/config";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
};

describe("StatementsPage (REQ-059 / UAT-076)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("REQ-059: statement shows totals, net and direction", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            statementId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            participantId: "11111111-1111-1111-1111-111111111111",
            communityId: "22222222-2222-2222-2222-222222222222",
            period: "2026-10",
            periodFrom: "2026-10-01T00:00:00Z",
            periodUntil: "2026-11-01T00:00:00Z",
            totalBought: "6.25",
            totalSold: "20.50",
            netBalance: "14.25",
            direction: "to_receive",
            currency: "EUR",
            invoiceIds: ["i1", "i2", "i3"],
            status: "Open",
            revision: 1,
          },
        ],
      }),
    );

    render(
      <MemoryRouter>
        <StatementsPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("14.25 EUR")).toBeInTheDocument();
    expect(screen.getByText(/to receive/i)).toBeInTheDocument();
    expect(screen.getByText("3 invoices")).toBeInTheDocument();
    expect(screen.getByText(/6\.25 EUR/)).toBeInTheDocument();
    expect(screen.getByText(/20\.50 EUR/)).toBeInTheDocument();
  });

  it("shows an error when load fails", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    render(
      <MemoryRouter>
        <StatementsPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    });
  });
});
