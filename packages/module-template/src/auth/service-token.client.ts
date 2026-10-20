/**
 * INT-287 — Keycloak client-credentials token for inter-module calls (04 §7).
 */

export type ServiceTokenClientOptions = {
  baseUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
  /** Optional fetch override (tests). */
  fetchImpl?: typeof fetch;
  /** Clock skew buffer before expiry (ms). */
  refreshSkewMs?: number;
};

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
};

export class ServiceTokenClient {
  private cached: { token: string; expiresAtMs: number } | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly refreshSkewMs: number;

  constructor(private readonly options: ServiceTokenClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.refreshSkewMs = options.refreshSkewMs ?? 30_000;
  }

  /** True when client credentials are configured. */
  static isConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
    return Boolean(
      env.KEYCLOAK_BASE_URL &&
        env.KEYCLOAK_REALM &&
        env.KEYCLOAK_SERVICE_CLIENT_ID &&
        env.KEYCLOAK_SERVICE_CLIENT_SECRET,
    );
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): ServiceTokenClient | null {
    if (!ServiceTokenClient.isConfigured(env)) {
      return null;
    }
    return new ServiceTokenClient({
      baseUrl: env.KEYCLOAK_BASE_URL!,
      realm: env.KEYCLOAK_REALM!,
      clientId: env.KEYCLOAK_SERVICE_CLIENT_ID!,
      clientSecret: env.KEYCLOAK_SERVICE_CLIENT_SECRET!,
    });
  }

  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAtMs - this.refreshSkewMs > now) {
      return this.cached.token;
    }
    const tokenUrl = `${this.options.baseUrl.replace(/\/$/, "")}/realms/${this.options.realm}/protocol/openid-connect/token`;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
    });
    const res = await this.fetchImpl(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      throw new Error(`service_token_http_${res.status}`);
    }
    const json = (await res.json()) as TokenResponse;
    if (!json.access_token) {
      throw new Error("service_token_missing_access_token");
    }
    const expiresInSec = typeof json.expires_in === "number" ? json.expires_in : 300;
    this.cached = {
      token: json.access_token,
      expiresAtMs: now + expiresInSec * 1000,
    };
    return json.access_token;
  }
}

/** Headers for internal HTTP: Bearer when available + forgeable headers for dual-mode / APISIX parity. */
export async function buildServiceRequestHeaders(input: {
  sub: string;
  tokenClient?: ServiceTokenClient | null;
}): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-intelligent-roles": "service",
    "x-intelligent-sub": input.sub,
    "x-intelligent-token-use": "service",
  };
  if (input.tokenClient) {
    const token = await input.tokenClient.getAccessToken();
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}
