import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveServiceAuthHeaders } from "./service-auth-headers.js";
import { ServiceTokenClient } from "./service-token.client.js";

describe("resolveServiceAuthHeaders (INT-287)", () => {
  afterEach(() => {
    delete process.env.KEYCLOAK_BASE_URL;
    delete process.env.KEYCLOAK_REALM;
    delete process.env.KEYCLOAK_SERVICE_CLIENT_ID;
    delete process.env.KEYCLOAK_SERVICE_CLIENT_SECRET;
  });

  it("uses a string Bearer without calling Keycloak", async () => {
    const headers = await resolveServiceAuthHeaders("ac-05", "tok-1");
    expect(headers.Authorization).toBe("Bearer tok-1");
    expect(headers["x-intelligent-roles"]).toBe("service");
    expect(headers["x-intelligent-sub"]).toBe("ac-05");
  });

  it("falls back to forgeable headers when Keycloak is not configured", async () => {
    const headers = await resolveServiceAuthHeaders("ac-05", null);
    expect(headers.Authorization).toBeUndefined();
    expect(headers["x-intelligent-token-use"]).toBe("service");
  });

  it("uses ServiceTokenClient when provided", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ access_token: "kc-token", expires_in: 300 }),
    );
    const client = new ServiceTokenClient({
      baseUrl: "http://keycloak",
      realm: "int",
      clientId: "module-service",
      clientSecret: "secret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const headers = await resolveServiceAuthHeaders("ac-14", client);
    expect(headers.Authorization).toBe("Bearer kc-token");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
