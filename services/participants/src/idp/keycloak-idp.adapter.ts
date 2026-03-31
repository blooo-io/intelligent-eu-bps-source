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

  async createUser(input: IdpCreateUserInput): Promise<IdpUser> {
    const token = await this.token();
    const res = await fetch(
      `${this.config.baseUrl}/admin/realms/${encodeURIComponent(this.config.realm)}/users`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          enabled: true,
          email: input.email,
          username: input.email,
          emailVerified: false,
          attributes: {
            communityId: [input.communityId],
            role: [input.role],
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
    return { userId };
  }

  async sendInvitation(userId: string): Promise<void> {
    const token = await this.token();
    const res = await fetch(
      `${this.config.baseUrl}/admin/realms/${encodeURIComponent(this.config.realm)}/users/${encodeURIComponent(userId)}/execute-actions-email`,
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(["VERIFY_EMAIL", "UPDATE_PASSWORD"]),
      },
    );
    if (!res.ok) {
      throw new Error(`Keycloak sendInvitation failed with HTTP ${res.status}`);
    }
  }

  async deleteUser(userId: string): Promise<void> {
    const token = await this.token();
    const res = await fetch(
      `${this.config.baseUrl}/admin/realms/${encodeURIComponent(this.config.realm)}/users/${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
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
        headers: { "content-type": "application/x-www-form-urlencoded" },
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
