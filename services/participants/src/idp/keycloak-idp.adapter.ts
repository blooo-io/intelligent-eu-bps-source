import type { IdpAdminPort, IdpCreateUserInput, IdpUser } from "./idp.port.js";

export type KeycloakIdpConfig = {
  baseUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
};

type TokenResponse = { access_token: string };

/**
 * P-IDP against Keycloak Admin REST (INT-208 / architecture §7).
 * Uses client-credentials; never logs e-mail or tokens (NFR-015).
 */
export class KeycloakIdpAdapter implements IdpAdminPort {
  constructor(private readonly config: KeycloakIdpConfig) {
    if (!config.baseUrl || !config.realm || !config.clientId || !config.clientSecret) {
      throw new Error("KeycloakIdpAdapter requires baseUrl, realm, clientId, clientSecret");
    }
  }

  /**
   * INT-218 — cluster-internal HTTP to Keycloakx needs Forwarded proto=https
   * because realm sslRequired=external rejects bare http (HTTPS required).
   */
  private proxyHeaders(): Record<string, string> {
    if (this.config.baseUrl.startsWith("https://")) {
      return {};
    }
    return {
      "X-Forwarded-Proto": "https",
      "X-Forwarded-Port": "443",
      Forwarded: "proto=https",
    };
  }

  async createUser(input: IdpCreateUserInput): Promise<IdpUser> {
    const token = await this.token();
    const headers = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...this.proxyHeaders(),
    };
    // Attribute must match the oidc-usermodel-attribute-mapper claim
    // `community_id` in int-realm.json (not camelCase). Market role
    // (consumer|producer|prosumer) stays in AC-03; IdP realm role is member.
    const res = await fetch(
      `${this.config.baseUrl}/admin/realms/${encodeURIComponent(this.config.realm)}/users`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          enabled: true,
          email: input.email,
          username: input.email,
          emailVerified: false,
          attributes: {
            community_id: [input.communityId],
          },
        }),
      },
    );
    if (res.status !== 201) {
      throw new Error(`Keycloak createUser failed with HTTP ${res.status}`);
    }
    const location = res.headers.get("location") ?? "";
    const userId = location.split("/").pop();
    if (!userId) {
      throw new Error("Keycloak createUser missing Location user id");
    }
    await this.assignRealmRole(userId, "member", headers);
    return { userId };
  }

  /**
   * REQ-008 invitees are community members. Keycloak ignores realmRoles on
   * POST /users — map via role-mappings after create (same pattern as
   * scripts/keycloak-ensure-uat-users.mjs).
   */
  private async assignRealmRole(
    userId: string,
    roleName: string,
    headers: Record<string, string>,
  ): Promise<void> {
    const roleRes = await fetch(
      `${this.config.baseUrl}/admin/realms/${encodeURIComponent(this.config.realm)}/roles/${encodeURIComponent(roleName)}`,
      { headers },
    );
    if (!roleRes.ok) {
      throw new Error(
        `Keycloak get role ${roleName} failed with HTTP ${roleRes.status}`,
      );
    }
    const role = (await roleRes.json()) as Record<string, unknown>;
    const map = await fetch(
      `${this.config.baseUrl}/admin/realms/${encodeURIComponent(this.config.realm)}/users/${encodeURIComponent(userId)}/role-mappings/realm`,
      {
        method: "POST",
        headers,
        body: JSON.stringify([role]),
      },
    );
    if (!map.ok && map.status !== 409) {
      throw new Error(
        `Keycloak role-map ${roleName} failed with HTTP ${map.status}`,
      );
    }
  }

  async sendInvitation(userId: string): Promise<void> {
    const token = await this.token();
    const headers = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...this.proxyHeaders(),
    };
    const userUrl = `${this.config.baseUrl}/admin/realms/${encodeURIComponent(this.config.realm)}/users/${encodeURIComponent(userId)}`;
    const actions = ["VERIFY_EMAIL", "UPDATE_PASSWORD"] as const;

    // Always stamp required actions (works without SMTP).
    const get = await fetch(userUrl, { headers });
    if (!get.ok) {
      throw new Error(`Keycloak getUser failed with HTTP ${get.status}`);
    }
    const existing = (await get.json()) as Record<string, unknown>;
    const put = await fetch(userUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        ...existing,
        requiredActions: [...actions],
      }),
    });
    if (!put.ok) {
      throw new Error(`Keycloak setRequiredActions failed with HTTP ${put.status}`);
    }

    // REQ-008 invitation email — best-effort in V1 when realm has no SMTP
    // (Keycloak returns 500 from execute-actions-email without a mail host).
    const mail = await fetch(`${userUrl}/execute-actions-email`, {
      method: "PUT",
      headers,
      body: JSON.stringify([...actions]),
    });
    if (!mail.ok && mail.status !== 500) {
      throw new Error(`Keycloak sendInvitation failed with HTTP ${mail.status}`);
    }
  }

  async deleteUser(userId: string): Promise<void> {
    const token = await this.token();
    const res = await fetch(
      `${this.config.baseUrl}/admin/realms/${encodeURIComponent(this.config.realm)}/users/${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${token}`,
          ...this.proxyHeaders(),
        },
      },
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`Keycloak deleteUser failed with HTTP ${res.status}`);
    }
  }

  private async token(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });
    const res = await fetch(
      `${this.config.baseUrl}/realms/${encodeURIComponent(this.config.realm)}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          ...this.proxyHeaders(),
        },
        body,
      },
    );
    if (!res.ok) {
      throw new Error(`Keycloak token failed with HTTP ${res.status}`);
    }
    const json = (await res.json()) as TokenResponse;
    if (!json.access_token) {
      throw new Error("Keycloak token response missing access_token");
    }
    return json.access_token;
  }
}

export function readKeycloakIdpConfig(
  env: NodeJS.ProcessEnv = process.env,
): KeycloakIdpConfig | null {
  const baseUrl = env.KEYCLOAK_BASE_URL ?? env.IDP_ADMIN_BASE_URL;
  const realm = env.KEYCLOAK_REALM ?? env.IDP_ADMIN_REALM ?? "int";
  const clientId = env.KEYCLOAK_ADMIN_CLIENT_ID ?? env.IDP_ADMIN_CLIENT_ID;
  const clientSecret =
    env.KEYCLOAK_ADMIN_CLIENT_SECRET ?? env.IDP_ADMIN_CLIENT_SECRET;
  if (!baseUrl || !clientId || !clientSecret) {
    return null;
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), realm, clientId, clientSecret };
}
