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
  lines: [
    {
      tradeId: "trade-a",
      deliveryStart: "2026-11-01T00:00:00Z",
      deliveryEnd: "2026-11-01T00:15:00Z",
      kWh: "10.000",
      pricePerKWh: "0.20",
      amount: "2.00",
    },
    {
      tradeId: "trade-b",
      deliveryStart: "2026-11-01T00:15:00Z",
      deliveryEnd: "2026-11-01T00:30:00Z",
      kWh: "40.000",
      pricePerKWh: "0.20",
      amount: "8.00",
    },
  ],
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
      expect(screen.getByText("10.000")).toBeInTheDocument();
      expect(screen.getByText("40.000")).toBeInTheDocument();
      expect(screen.getByText("2026-11-01T00:00:00Z – 2026-11-01T00:15:00Z")).toBeInTheDocument();
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

  it("INT-269 — prosumer sees Pay when they are the invoice consumer", async () => {
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
            role: "prosumer",
            readiness: "Ready",
            profile: { name: "Pro", address: "1", email: "p@e.com" },
          }),
        };
      }
      if (path.endsWith("/v1/me/invoices") && (!init || !init.method || init.method === "GET")) {
        return { ok: true, json: async () => [invoice] };
      }
      if (path.endsWith(`/v1/invoices/${invoice.invoiceId}`) && (!init?.method || init.method === "GET")) {
        return { ok: true, json: async () => invoice };
      }
      return { ok: false, status: 404 };
    });
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <InvoicesPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/12\.00 EUR/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /^view$/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^pay$/i })).toBeInTheDocument();
    });
  });

  it("INT-269 — prosumer has no Pay when only the issuer on the invoice", async () => {
    const issued = {
      ...invoice,
      consumerId: "99999999-9999-4999-8999-999999999999",
      producerId: "11111111-1111-1111-1111-111111111111",
    };
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
        if (path.endsWith("/v1/me") && !path.includes("/invoices")) {
          return {
            ok: true,
            json: async () => ({
              participantId: issued.producerId,
              communityId: "22222222-2222-2222-2222-222222222222",
              roles: ["member"],
              role: "prosumer",
              readiness: "Ready",
              profile: { name: "Pro", address: "1", email: "p@e.com" },
            }),
          };
        }
        if (path.endsWith("/v1/me/invoices") && (!init || !init.method || init.method === "GET")) {
          return { ok: true, json: async () => [issued] };
        }
        if (path.endsWith(`/v1/invoices/${issued.invoiceId}`) && (!init?.method || init.method === "GET")) {
          return { ok: true, json: async () => issued };
        }
        return { ok: false, status: 404 };
      }),
    );

    render(
      <MemoryRouter>
        <InvoicesPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/12\.00 EUR/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /^view$/i }));
    await waitFor(() => {
      expect(screen.getByText(/Issued to consumers|Your invoices/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /^pay$/i })).toBeNull();
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
