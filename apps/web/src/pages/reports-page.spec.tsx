import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ReportsPage } from "./reports-page";
import type { OidcFacade } from "../auth/oidc";
import type { WebConfig } from "../api/config";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
};

const participantId = "11111111-1111-1111-1111-111111111111";
const communityId = "22222222-2222-2222-2222-222222222222";
const invoiceId = "55555555-5555-5555-5555-555555555555";
const paymentId = "66666666-6666-6666-6666-666666666666";

function stubOidc(): OidcFacade {
  return {
    login: vi.fn(),
    handleCallback: vi.fn(),
    logout: vi.fn(),
    getUser: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue("tok"),
  };
}

function meResponse() {
  return {
    ok: true,
    json: async () => ({
      participantId,
      communityId,
      roles: ["manager"],
      role: "prosumer",
      readiness: "Ready",
      profile: { name: "Mgr", address: "1", email: "m@e.com" },
    }),
  };
}

describe("ReportsPage (INT-148 / UAT-031 / UAT-032)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads member history", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      const path = String(url);
      if (path.endsWith("/v1/me")) return meResponse();
      if (path.endsWith(`/v1/participants/${participantId}/history`)) {
        return {
          ok: true,
          json: async () => ({
            participantId,
            invoices: [
              {
                invoiceId,
                producerId: "p",
                consumerId: participantId,
                currency: "EUR",
                status: "Open",
                amounts: { energy: "10.00", vat: "2.00", total: "12.00" },
              },
            ],
            payments: [
              {
                paymentId,
                invoiceId,
                amount: "12.00",
                currency: "EUR",
                status: "succeeded",
              },
            ],
          }),
        };
      }
      return { ok: false, status: 404 };
    });
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <ReportsPage config={config} oidc={stubOidc()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue(participantId)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^load$/i }));

    await waitFor(() => {
      expect(screen.getByText(/1 invoice\(s\)/)).toBeInTheDocument();
    });
    expect(screen.getByText(new RegExp(invoiceId))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(paymentId))).toBeInTheDocument();
  });

  it("loads periodic summary", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      const path = String(url);
      if (path.endsWith("/v1/me")) return meResponse();
      if (path.includes("/v1/reports/summary")) {
        return {
          ok: true,
          json: async () => ({
            communityId,
            period: "2026-09",
            currency: "EUR",
            invoiceCount: 2,
            paymentCount: 1,
            total: "24.00",
          }),
        };
      }
      return { ok: false, status: 404 };
    });
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <ReportsPage config={config} oidc={stubOidc()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/community totals/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Summary period/i), {
      target: { value: "2026-09" },
    });
    fireEvent.click(screen.getByRole("button", { name: /load summary/i }));

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/invoices 2/);
    });
    expect(document.body.textContent).toMatch(/24\.00 EUR/);
    expect(
      fetchImpl.mock.calls.some((c) => String(c[0]).includes("reports/summary")),
    ).toBe(true);
  });

  it("shows an error when me load fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403 }),
    );

    render(
      <MemoryRouter>
        <ReportsPage config={config} oidc={stubOidc()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/failed with 403/i)).toBeInTheDocument();
    });
  });

  it("shows an error when history fails", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      const path = String(url);
      if (path.endsWith("/v1/me")) return meResponse();
      if (path.includes("/history")) return { ok: false, status: 404 };
      return { ok: false, status: 404 };
    });
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <ReportsPage config={config} oidc={stubOidc()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue(participantId)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^load$/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed with 404/i)).toBeInTheDocument();
    });
  });
});
