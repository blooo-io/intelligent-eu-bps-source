import type { IdpAdminPort } from "./idp.port.js";
import { KeycloakIdpAdapter, readKeycloakIdpConfig } from "./keycloak-idp.adapter.js";
import { MockIdpAdapter } from "./mock-idp.adapter.js";

/**
 * INT-208 — select Keycloak Admin when configured, else mock (CI / offline).
 * IDP_ADMIN_PROVIDER=mock forces the mock even if Keycloak env is present.
 */
export function createIdpAdminPort(
  env: NodeJS.ProcessEnv = process.env,
): IdpAdminPort {
  const provider = (env.IDP_ADMIN_PROVIDER ?? "").toLowerCase();
  if (provider === "mock") {
    return new MockIdpAdapter();
  }
  const cfg = readKeycloakIdpConfig(env);
  if (cfg && (provider === "keycloak" || provider === "")) {
    return new KeycloakIdpAdapter(cfg);
  }
  return new MockIdpAdapter();
}
