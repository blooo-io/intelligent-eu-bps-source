import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ApiConsolePage } from "./api-console-page";
import { PUBLIC_OPERATIONS } from "../api/public-operations";
import type { OidcFacade } from "../auth/oidc";
import type { WebConfig } from "../api/config";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
};

const me = {
  participantId: "11111111-1111-4111-8111-111111111111",
  communityId: "22222222-2222-4222-8222-222222222222",
  roles: ["member"],
  role: "consumer",
  readiness: "Invited",
  profile: { name: "", address: "", email: "ada@example.invalid" },
};

describe("ApiConsolePage (INT-387 / REQ-052)", () => {
  it("calls the selected read operation and shows the response", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue("tok"),
    };
    const fetchImpl = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => me,
      text: async () => JSON.stringify({ readiness: "Invited" }),
      blob: async () => new Blob(),
    }));
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <ApiConsolePage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(
        new RegExp(`${PUBLIC_OPERATIONS.length} operations from the public contract`),
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("api-url")).toHaveTextContent("GET /v1/me");

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByTestId("api-response")).toHaveTextContent("Invited");
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example/v1/me",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("shows a missing token without calling the API", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn(),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue(null),
    };
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <ApiConsolePage config={config} oidc={oidc} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/No access token/)).toBeInTheDocument();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
