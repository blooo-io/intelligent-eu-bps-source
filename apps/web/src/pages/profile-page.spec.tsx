import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ProfilePage } from "./profile-page";
import type { OidcFacade } from "../auth/oidc";
import type { WebConfig } from "../api/config";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
};

describe("ProfilePage (INT-138 / UAT-009)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads profile fields and saves name/address/email only", async () => {
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
          participantId: "11111111-1111-1111-1111-111111111111",
          communityId: "22222222-2222-2222-2222-222222222222",
          roles: ["member"],
          readiness: "Invited",
          profile: { name: "Ada", address: "1 Rue", email: "ada@example.com" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: "Ada Lovelace",
          address: "2 Rue",
          email: "ada@example.com",
        }),
      });
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <ProfilePage config={config} oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Ada")).toBeInTheDocument();
    });

    // Trade-attribution / community are read-only text — no editable community field.
    expect(screen.getByText(/22222222-2222-2222-2222-222222222222/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/community/i)).toBeNull();
    expect(screen.queryByLabelText(/gsy|meter|actor/i)).toBeNull();

    // fireEvent.change is much faster than userEvent.type (CI was >5s).
    fireEvent.change(screen.getByLabelText(/^Name$/i), {
      target: { value: "Ada Lovelace" },
    });
    fireEvent.change(screen.getByLabelText(/^Address$/i), {
      target: { value: "2 Rue" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(() => {
      expect(screen.getByText(/Profile saved/i)).toBeInTheDocument();
    });

    const putCall = fetchImpl.mock.calls.find(
      (c) => typeof c[0] === "string" && String(c[0]).endsWith("/v1/me/profile"),
    );
    expect(putCall?.[1]).toMatchObject({ method: "PUT" });
    expect(JSON.parse(putCall?.[1].body as string)).toEqual({
      name: "Ada Lovelace",
      address: "2 Rue",
      email: "ada@example.com",
    });
  });

  it("embedded mode omits PageFrame heading (INT-211)", async () => {
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
        json: async () => ({
          participantId: "11111111-1111-1111-1111-111111111111",
          communityId: "22222222-2222-2222-2222-222222222222",
          roles: ["member"],
          readiness: "Invited",
          profile: { name: "Ada", address: "1 Rue", email: "ada@example.com" },
        }),
      }),
    );

    render(
      <MemoryRouter>
        <ProfilePage config={config} oidc={oidc} embedded />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Ada")).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: /^billing profile$/i })).toBeNull();
    expect(screen.queryByTestId("page-frame")).toBeNull();
  });
});
