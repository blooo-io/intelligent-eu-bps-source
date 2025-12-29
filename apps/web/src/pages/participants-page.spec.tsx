import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ParticipantsPage } from "./participants-page";
import type { OidcFacade } from "../auth/oidc";
import type { WebConfig } from "../api/config";
import type { Participant, ParticipantRole } from "../api/participants";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
};

const communityId = "22222222-2222-2222-2222-222222222222";
const participantId = "11111111-1111-1111-1111-111111111111";

const existing: Participant = {
  participantId,
  communityId,
  role: "consumer",
  status: "Invited",
  marketActorId: "actor-1",
  meterId: "meter-1",
};

function stubOidc(): OidcFacade {
  return {
    login: vi.fn(),
    handleCallback: vi.fn(),
    logout: vi.fn(),
    getUser: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue("tok"),
  };
}

function meAndList(registry: Participant[]) {
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const path = String(url);
    if (path.endsWith("/v1/me")) {
      return {
        ok: true,
        json: async () => ({
          participantId,
          communityId,
          roles: ["manager"],
          readiness: "Ready",
          profile: { name: "Mgr", address: "1", email: "m@e.com" },
        }),
      };
    }
    if (
      path.endsWith(`/v1/communities/${communityId}/participants`) &&
      (!init?.method || init.method === "GET")
    ) {
      return { ok: true, json: async () => registry };
    }
    if (path.includes("participants:import") && init?.method === "POST") {
      const body = JSON.parse(init.body as string) as {
        participants: {
          email: string;
          marketActorId: string;
          meterId: string;
          role: ParticipantRole;
        }[];
      };
      const created: Participant[] = body.participants.map((p, i) => ({
        participantId: `33333333-3333-3333-3333-33333333333${i}`,
        communityId,
        role: p.role,
        status: "Invited",
        marketActorId: p.marketActorId,
        meterId: p.meterId,
      }));
      registry.push(...created);
      return { ok: true, json: async () => created };
    }
    if (path.endsWith(`/v1/participants/${participantId}`) && init?.method === "PATCH") {
      const patch = JSON.parse(init.body as string);
      Object.assign(registry[0], patch);
      return { ok: true, json: async () => registry[0] };
    }
    if (
      path.endsWith(`/v1/participants/${participantId}:offboard`) &&
      init?.method === "POST"
    ) {
      registry[0].status = "Offboarded";
      return { ok: true, json: async () => registry[0] };
    }
    return { ok: false, status: 404 };
  });
}

describe("ParticipantsPage (INT-145 / UAT-008 / UAT-012)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("imports CSV into the registry", async () => {
    const registry = [{ ...existing }];
    const fetchImpl = meAndList(registry);
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <ParticipantsPage config={config} oidc={stubOidc()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/actor-1/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Participant CSV/i), {
      target: {
        value:
          "email,marketActorId,meterId,role\nnew@example.com,actor-9,meter-9,producer\n",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^import$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Imported 1 participant/i)).toBeInTheDocument();
    });
    expect(
      fetchImpl.mock.calls.some(
        (c) => typeof c[0] === "string" && String(c[0]).includes("participants:import"),
      ),
    ).toBe(true);
  });

  it("patches attribution", async () => {
    const registry = [{ ...existing }];
    const fetchImpl = meAndList(registry);
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <ParticipantsPage config={config} oidc={stubOidc()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/actor-1/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("actor-1")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Market actor id/i), {
      target: { value: "actor-updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Participant updated/i)).toBeInTheDocument();
    });
  });

  it("offboards a selected participant", async () => {
    const registry = [{ ...existing }];
    const fetchImpl = meAndList(registry);
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <ParticipantsPage config={config} oidc={stubOidc()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/actor-1/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /offboard/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /offboard/i }));

    await waitFor(() => {
      expect(screen.getByText(/Participant offboarded/i)).toBeInTheDocument();
    });
  });

  it("shows an error when load fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403 }),
    );

    render(
      <MemoryRouter>
        <ParticipantsPage config={config} oidc={stubOidc()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/failed with 403/i)).toBeInTheDocument();
    });
  });

  it("shows CSV parse errors without calling import", async () => {
    const fetchImpl = meAndList([]);
    vi.stubGlobal("fetch", fetchImpl);

    render(
      <MemoryRouter>
        <ParticipantsPage config={config} oidc={stubOidc()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/No participants yet/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Participant CSV/i), {
      target: { value: "bad-row" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^import$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Invalid CSV row/i)).toBeInTheDocument();
    });
    expect(
      fetchImpl.mock.calls.some(
        (c) => typeof c[0] === "string" && String(c[0]).includes("import"),
      ),
    ).toBe(false);
  });
});
