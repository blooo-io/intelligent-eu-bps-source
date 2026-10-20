import {
  ServiceTokenClient,
  buildServiceRequestHeaders,
} from "./service-token.client.js";

/** String Bearer (tests) or Keycloak client (cluster). */
export type ServiceAuthSource = string | ServiceTokenClient | null | undefined;

export async function resolveServiceAuthHeaders(
  sub: string,
  auth: ServiceAuthSource = ServiceTokenClient.fromEnv(),
): Promise<Record<string, string>> {
  if (typeof auth === "string" && auth.length > 0) {
    return {
      Accept: "application/json",
      Authorization: `Bearer ${auth}`,
      "x-intelligent-roles": "service",
      "x-intelligent-sub": sub,
      "x-intelligent-token-use": "service",
    };
  }
  const client = auth instanceof ServiceTokenClient ? auth : ServiceTokenClient.fromEnv();
  return buildServiceRequestHeaders({ sub, tokenClient: client });
}
