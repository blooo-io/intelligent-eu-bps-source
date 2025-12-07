import type { AuthProvider } from "@refinedev/core";
import type { OidcFacade } from "./oidc";
import { communityIdFromClaims, rolesFromClaims, type TokenClaims } from "./claims";

/**
 * Refine AuthProvider backed by OIDC PKCE (TD-5).
 * login() always redirects to the IdP — no password field in this app (REQ-033).
 */
export function createAuthProvider(oidc: OidcFacade): AuthProvider {
  return {
    login: async () => {
      await oidc.login();
      return { success: true };
    },
    logout: async () => {
      await oidc.logout();
      return { success: true, redirectTo: "/" };
    },
    check: async () => {
      const user = await oidc.getUser();
      if (!user || user.expired) {
        return { authenticated: false, redirectTo: "/login", logout: true };
      }
      return { authenticated: true };
    },
    getIdentity: async () => {
      const user = await oidc.getUser();
      if (!user) return null;
      const claims = (user.profile ?? {}) as TokenClaims;
      return {
        id: user.profile.sub,
        name: user.profile.name ?? user.profile.preferred_username,
        roles: rolesFromClaims(claims),
        communityId: communityIdFromClaims(claims),
      };
    },
    getPermissions: async () => {
      const user = await oidc.getUser();
      if (!user) return null;
      return rolesFromClaims((user.profile ?? {}) as TokenClaims);
    },
    onError: async (error) => {
      const status = (error as { statusCode?: number })?.statusCode;
      if (status === 401 || status === 403) {
        return { logout: true, redirectTo: "/login" };
      }
      return { error: error as Error };
    },
  };
}
