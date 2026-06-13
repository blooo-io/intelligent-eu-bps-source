import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { InvoicesPage } from "./invoices-page";
import type { OidcFacade } from "../auth/oidc";
import type { WebConfig } from "../api/config";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
};

const invoice = {
  invoiceId: "55555555-5555-5555-5555-555555555555",
  legalNumber: "INV-1",
  producerId: "33333333-3333-3333-3333-333333333333",
  consumerId: "11111111-1111-1111-1111-111111111111",
  currency: "EUR",
  status: "Open",
  amounts: { energy: "10.00", vat: "2.00", total: "12.00" },
  tradeIds: ["trade-a", "trade-b"],
};

describe("InvoicesPage (INT-142 / UAT-007 / UAT-014)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists invoices, shows detail trades/totals, pays, and opens PDF", async () => {
    const openBlobUrl = vi.fn();
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };

    const fetchImpl = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/v1/me") && !path.includes("/invoices")) {
        return {
          ok: true,
          json: async () => ({
            participantId: invoice.consumerId,
            communityId: "22222222-2222-2222-2222-222222222222",
            roles: ["member"],
            role: "consumer",
            readiness: "Ready",
            profile: { name: "Ada", address: "1", email: "a@e.com" },
          }),
        };
      }
      if (path.endsWith("/v1/me/invoices") && (!init || !init.method || init.method === "GET")) {
        return { ok: true, json: async () => [invoice] };
      }
      if (path.endsWith(`/v1/invoices/${invoice.invoiceId}`) && (!init?.method || init.method === "GET")) {
        return { ok: true, json: async () => invoice };
      }
      if (path.endsWith(`/v1/invoices/${invoice.invoiceId}/document`)) {
        return {
          ok: true,
          blob: async () => new Blob(["%PDF"], { type: "application/pdf" }),
        };
      }
      if (path.endsWith(`/v1/invoices/${invoice.invoiceId}/payments`) && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            paymentId: "66666666-6666-6666-6666-666666666666",
            invoiceId: invoice.invoiceId,
            amount: "12.00",
            currency: "EUR",
            status: "Succeeded",
          }),
        };
      }
      return { ok: false, status: 404 };
    });
    vi.stubGlobal("fetch", fetchImpl);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:mock-pdf"),
    });

    render(
      <MemoryRouter>
        <InvoicesPage config={config} oidc={oidc} openBlobUrl={openBlobUrl} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/12\.00 EUR/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^view$/i }));

    await waitFor(() => {
      expect(screen.getByText(/trade-a, trade-b/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Energy 10\.00/)).toBeInTheDocument();
    expect(
      screen.getByText(/do not include grid fees, taxes or levies/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^pay$/i }));
    await waitFor(() => {
      expect(screen.getByText(/Payment 66666666/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /open pdf/i }));
    await waitFor(() => {
      expect(openBlobUrl).toHaveBeenCalledWith("blob:mock-pdf");
    });
  });

  it("shows empty state when there are no invoices", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        const path = String(url);
        if (path.endsWith("/v1/me") && !path.includes("/invoices")) {
          return {
            ok: true,
            json: async () => ({
              participantId: "11111111-1111-1111-1111-111111111111",
              communityId: "22222222-2222-2222-2222-222222222222",
              roles: ["member"],
              role: "consumer",
              readiness: "Ready",
              profile: { name: "Ada", address: "1", email: "a@e.com" },
            }),
          };
        }
        return { ok: true, json: async () => [] };
      }),
    );

    render(
      <MemoryRouter>
        <InvoicesPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/No invoices yet/i)).toBeInTheDocument();
    });
  });

  it("shows an error when the token is missing", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue(null),
    };

    render(
      <MemoryRouter>
        <InvoicesPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/No access token/i)).toBeInTheDocument();
    });
  });
});
