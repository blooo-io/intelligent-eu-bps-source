import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";
import type { WebConfig } from "../api/config";

/**
 * OIDC Authorization Code + PKCE client (NFR-011, REQ-033, UAT-043).
 * The billing app never prompts for or stores a password — only tokens
 * in sessionStorage via oidc-client-ts.
 */

export type OidcFacade = {
  login: () => Promise<void>;
  handleCallback: () => Promise<User>;
  logout: () => Promise<void>;
  getUser: () => Promise<User | null>;
  getAccessToken: () => Promise<string | null>;
};

/** Build a UserManager bound to the runtime config. */
export function createUserManager(config: WebConfig): UserManager {
  const redirectUri = `${window.location.origin}/auth/callback`;
  return new UserManager({
    authority: config.oidcAuthority,
    client_id: config.oidcClientId,
    redirect_uri: redirectUri,
    post_logout_redirect_uri: window.location.origin,
    response_type: "code",
    scope: "openid profile email",
    // PKCE is on by default in oidc-client-ts for public clients.
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    automaticSilentRenew: true,
  });
}

/** Thin facade so Refine and tests can mock OIDC without Keycloak. */
export function createOidcFacade(manager: UserManager): OidcFacade {
  return {
    async login() {
      // Redirect to the IdP login page — no local password form (UAT-043).
      await manager.signinRedirect();
    },
    async handleCallback() {
      return manager.signinRedirectCallback();
    },
    async logout() {
      await manager.signoutRedirect();
    },
    async getUser() {
      return manager.getUser();
    },
    async getAccessToken() {
      const user = await manager.getUser();
      if (!user || user.expired) return null;
      return user.access_token;
    },
  };
}
