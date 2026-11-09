import type { AuthProvider } from "@refinedev/core";
import type { OidcFacade } from "./oidc";
import {
  DEFAULT_ROLE_CLAIM,
  communityIdFromClaims,
  rolesFromClaims,
  type TokenClaims,
} from "./claims";

/**
 * Refine AuthProvider backed by OIDC PKCE (TD-5).
 * login() always redirects to the IdP — no password field in this app (REQ-033).
 */
export function createAuthProvider(
  oidc: OidcFacade,
  roleClaim: string = DEFAULT_ROLE_CLAIM,
): AuthProvider {
  return {
    login: async () => {
      await oidc.login();
      return { success: true };
    },
    logout: async () => {
      await oidc.logout();
      // Land on the public sign-in screen, not on Authenticated `/` (INT-181).
      return { success: true, redirectTo: "/login" };
    },
    check: async () => {
      const user = await oidc.getUser();
      if (!user || user.expired) {
        // Do not set logout:true here — that re-enters logout → redirect and
        // can leave `/` blank when the router provider is missing (INT-181).
        return { authenticated: false, redirectTo: "/login" };
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
        roles: rolesFromClaims(claims, roleClaim),
        communityId: communityIdFromClaims(claims),
      };
    },
    getPermissions: async () => {
      const user = await oidc.getUser();
      if (!user) return null;
      return rolesFromClaims((user.profile ?? {}) as TokenClaims, roleClaim);
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
