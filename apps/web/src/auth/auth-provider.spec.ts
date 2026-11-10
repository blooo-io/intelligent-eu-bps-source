import { describe, expect, it, vi } from "vitest";
import { createAuthProvider } from "./auth-provider";
import type { OidcFacade } from "./oidc";

function facade(overrides: Partial<OidcFacade> = {}): OidcFacade {
  return {
    login: vi.fn(),
    handleCallback: vi.fn(),
    logout: vi.fn(),
    getUser: vi.fn().mockResolvedValue(null),
    getAccessToken: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe("createAuthProvider", () => {
  it("login delegates to OIDC redirect (no password)", async () => {
    const oidc = facade({ login: vi.fn().mockResolvedValue(undefined) });
    const provider = createAuthProvider(oidc);
    const result = await provider.login({} as never);
    expect(oidc.login).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it("check reports unauthenticated when there is no user", async () => {
    const provider = createAuthProvider(facade());
    const result = await provider.check();
    expect(result.authenticated).toBe(false);
    expect(result.redirectTo).toBe("/login");
  });

  it("getIdentity exposes roles and community from token claims (UAT-060)", async () => {
    const provider = createAuthProvider(
      facade({
        getUser: vi.fn().mockResolvedValue({
          expired: false,
          profile: {
            sub: "user-1",
            name: "Ada",
            realm_access: { roles: ["manager"] },
            community_id: "comm-1",
          },
        }),
      }),
    );
    const identity = await provider.getIdentity?.();
    expect(identity).toMatchObject({
      id: "user-1",
      roles: ["manager"],
      communityId: "comm-1",
    });
  });

  it("reads roles from the configured role claim (NFR-013)", async () => {
    const provider = createAuthProvider(
      facade({
        getUser: vi.fn().mockResolvedValue({
          expired: false,
          profile: { sub: "user-2", roles: ["operator"], realm_access: { roles: ["member"] } },
        }),
      }),
      "roles",
    );
    expect(await provider.getIdentity?.()).toMatchObject({ roles: ["operator"] });
    expect(await provider.getPermissions?.()).toEqual(["operator"]);
  });

  it("onError logs out on 401", async () => {
    const provider = createAuthProvider(facade());
    const result = await provider.onError({ statusCode: 401 });
    expect(result.logout).toBe(true);
  });

  it("onError passes through non-auth errors", async () => {
    const provider = createAuthProvider(facade());
    const err = new Error("boom");
    const result = await provider.onError(err);
    expect(result.error).toBe(err);
  });

  it("logout redirects to the IdP end-session then /login (INT-181)", async () => {
    sessionStorage.setItem(
      "int.privacy.currentRequest",
      JSON.stringify({ requestId: "r", participantId: "p" }),
    );
    const oidc = facade({ logout: vi.fn().mockResolvedValue(undefined) });
    const provider = createAuthProvider(oidc);
    const result = await provider.logout({} as never);
    expect(oidc.logout).toHaveBeenCalled();
    expect(sessionStorage.getItem("int.privacy.currentRequest")).toBeNull();
    expect(result).toMatchObject({ success: true, redirectTo: "/login" });
  });

  it("check does not request logout when there is no session (INT-181)", async () => {
    const provider = createAuthProvider(facade());
    const result = await provider.check();
    expect(result).toEqual({ authenticated: false, redirectTo: "/login" });
    expect(result).not.toHaveProperty("logout", true);
  });

  it("check accepts a valid session", async () => {
    const provider = createAuthProvider(
      facade({
        getUser: vi.fn().mockResolvedValue({ expired: false }),
      }),
    );
    expect(await provider.check()).toEqual({ authenticated: true });
  });

  it("getPermissions returns roles from claims", async () => {
    const provider = createAuthProvider(
      facade({
        getUser: vi.fn().mockResolvedValue({
          profile: { realm_access: { roles: ["operator"] } },
        }),
      }),
    );
    expect(await provider.getPermissions?.()).toEqual(["operator"]);
  });

  it("getIdentity returns null without a user", async () => {
    const provider = createAuthProvider(facade());
    expect(await provider.getIdentity?.()).toBeNull();
  });
});
