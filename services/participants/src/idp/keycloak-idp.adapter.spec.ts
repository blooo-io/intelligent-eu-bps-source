import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KeycloakIdpAdapter,
  readKeycloakIdpConfig,
} from "./keycloak-idp.adapter.js";

const config = {
  baseUrl: "https://idp.example.test",
  realm: "int",
  clientId: "participants-admin",
  clientSecret: "secret",
};

describe("KeycloakIdpAdapter (INT-208)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refuses incomplete config", () => {
    expect(
      () =>
        new KeycloakIdpAdapter({
          baseUrl: "",
          realm: "int",
          clientId: "c",
          clientSecret: "s",
        }),
    ).toThrow(/requires/);
  });

  it("createUser posts community_id + maps realm role member (INT-285)", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/protocol/openid-connect/token")) {
        return { ok: true, json: async () => ({ access_token: "tok" }) };
      }
      if (init?.method === "POST" && u.endsWith("/users")) {
        return {
          status: 201,
          headers: {
            get: (name: string) =>
              name.toLowerCase() === "location"
                ? "https://idp.example.test/admin/realms/int/users/user-42"
                : null,
          },
        };
      }
      if (u.endsWith("/roles/member")) {
        return {
          ok: true,
          json: async () => ({ id: "role-member", name: "member" }),
        };
      }
      if (u.includes("/role-mappings/realm")) {
        return { ok: true, status: 204 };
      }
      return { ok: false, status: 500 };
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new KeycloakIdpAdapter(config);
    const user = await adapter.createUser({
      email: "member@example.test",
      communityId: "com-1",
      role: "consumer",
    });
    expect(user.userId).toBe("user-42");
    const createCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith("/users") && init?.method === "POST",
    );
    expect(createCall).toBeDefined();
    const body = JSON.parse(String(createCall![1]!.body)) as {
      attributes: Record<string, string[]>;
    };
    expect(body.attributes.community_id).toEqual(["com-1"]);
    expect(body.attributes.communityId).toBeUndefined();
    expect(body.attributes.role).toBeUndefined();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/users/user-42/role-mappings/realm"),
      ),
    ).toBe(true);
  });

  it("sends Forwarded proto=https on cluster-internal HTTP (INT-218)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "tok" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new KeycloakIdpAdapter({
      ...config,
      baseUrl: "http://platform-keycloak-keycloakx-http.keycloak.svc.cluster.local",
    });
    await expect(
      adapter.createUser({
        email: "x@example.test",
        communityId: "c",
        role: "member",
      }),
    ).rejects.toThrow(); // createUser fails after token (mock has no Location)
    const tokenHeaders = fetchMock.mock.calls[0]![1].headers as Record<string, string>;
    expect(tokenHeaders["X-Forwarded-Proto"]).toBe("https");
    expect(tokenHeaders.Forwarded).toBe("proto=https");
  });

  it("sendInvitation and deleteUser call Admin endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => ({ access_token: "tok", id: "user-1" }),
        headers: { get: () => null },
      });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new KeycloakIdpAdapter(config);
    await adapter.sendInvitation("user-1");
    await adapter.deleteUser("user-1");
    // token + getUser + putActions + execute-email + token + delete
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(5);
  });

  it("sendInvitation tolerates execute-actions-email 500 without SMTP (INT-218)", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/protocol/openid-connect/token")) {
        return { ok: true, json: async () => ({ access_token: "tok" }) };
      }
      if (init?.method === "PUT" && u.endsWith("/execute-actions-email")) {
        return { ok: false, status: 500 };
      }
      if (init?.method === "PUT") {
        return { ok: true, status: 204 };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "user-1", username: "x" }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new KeycloakIdpAdapter(config);
    await expect(adapter.sendInvitation("user-1")).resolves.toBeUndefined();
  });

  it("readKeycloakIdpConfig returns null when secrets missing", () => {
    expect(readKeycloakIdpConfig({})).toBeNull();
    expect(
      readKeycloakIdpConfig({
        KEYCLOAK_BASE_URL: "https://idp",
        KEYCLOAK_ADMIN_CLIENT_ID: "c",
        KEYCLOAK_ADMIN_CLIENT_SECRET: "s",
      }),
    ).toEqual({
      baseUrl: "https://idp",
      realm: "int",
      clientId: "c",
      clientSecret: "s",
    });
  });
});
