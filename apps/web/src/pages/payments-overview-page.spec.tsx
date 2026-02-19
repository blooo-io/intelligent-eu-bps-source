import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { PaymentsOverviewPage } from "./payments-overview-page";
import type { OidcFacade } from "../auth/oidc";
import type { WebConfig } from "../api/config";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
};

const communityId = "22222222-2222-2222-2222-222222222222";
const invoiceId = "55555555-5555-5555-5555-555555555555";
const paymentId = "66666666-6666-6666-6666-666666666666";

describe("PaymentsOverviewPage (INT-147 / UAT-018 / UAT-055)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Ant Design table + modal under CI load; default 5s is flaky (INT-81 CI).
  it("lists payments and sets invoice status with a reason", { timeout: 15_000 }, async () => {
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
      if (path.endsWith(`/v1/communities/${communityId}/payments-overview`)) {
        return {
          ok: true,
          json: async () => [
            {
              paymentId,
              invoiceId,
              amount: "12.00",
              currency: "EUR",
              status: "succeeded",
            },
            {
              paymentId: "77777777-7777-7777-7777-777777777777",
              invoiceId: "88888888-8888-8888-8888-888888888888",
              amount: "5.00",
              currency: "EUR",
              status: "failed",
              failureCategory: "card_declined",
            },
          ],
        };
      }
      if (path.endsWith(`/v1/invoices/${invoiceId}/status`) && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({ invoiceId, status: "Paid" }),
        };
      }
      return { ok: false, status: 404 };
    });
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <PaymentsOverviewPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/2 payment\(s\)/)).toBeInTheDocument();
    });
    expect(screen.getByText(/card_declined/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /set invoice status/i })[0]);

    await waitFor(() => {
      expect(screen.getByLabelText(/Status reason/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Status reason/i), {
      target: { value: "Paid outside platform" },
    });
    fireEvent.click(screen.getByRole("button", { name: /update status/i }));

    await waitFor(() => {
      expect(screen.getByText(new RegExp(`Invoice ${invoiceId}`))).toBeInTheDocument();
    });

    const postCall = fetchImpl.mock.calls.find(
      (c) =>
        typeof c[0] === "string" &&
        String(c[0]).endsWith(`/v1/invoices/${invoiceId}/status`),
    );
    expect(JSON.parse(postCall?.[1].body as string)).toEqual({
      status: "Paid",
      reason: "Paid outside platform",
    });
  });

  it("shows an error when load fails", { timeout: 15_000 }, async () => {
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
        <PaymentsOverviewPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/failed with 403/i)).toBeInTheDocument();
    });
  });

  it("shows an error when status update fails", { timeout: 15_000 }, async () => {
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
      if (path.includes("payments-overview")) {
        return {
          ok: true,
          json: async () => [
            {
              paymentId,
              invoiceId,
              amount: "12.00",
              currency: "EUR",
              status: "succeeded",
            },
          ],
        };
      }
      if (path.includes("/status") && init?.method === "POST") {
        return { ok: false, status: 400 };
      }
      return { ok: false, status: 404 };
    });
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <PaymentsOverviewPage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/12\.00 EUR/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /set invoice status/i }));
    fireEvent.change(screen.getByLabelText(/Status reason/i), {
      target: { value: "typo" },
    });
    fireEvent.click(screen.getByRole("button", { name: /update status/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed with 400/i)).toBeInTheDocument();
    });
  });
});
