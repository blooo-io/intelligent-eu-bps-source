/**
 * INT-287 — validate Keycloak JWTs for /internal/* when SERVICE_JWT_REQUIRED=true.
 */
import * as jose from "jose";
import type { AuthClaims } from "./auth.types.js";
import {
  DEFAULT_OIDC_ROLE_CLAIM,
  resolveRoleClaimPath,
  rolesAtClaimPath,
} from "./role-claim.js";

export type ServiceJwtVerifierOptions = {
  jwksUrl: string;
  issuer: string;
  /** Expected azp / client_id (optional). */
  audienceClientId?: string;
  /** Dot-path of the roles array claim (NFR-013, `OIDC_ROLE_CLAIM`). */
  roleClaim?: string;
};

let cachedJwks: ReturnType<typeof jose.createRemoteJWKSet> | null = null;
let cachedJwksUrl: string | null = null;

function jwksFor(url: string): ReturnType<typeof jose.createRemoteJWKSet> {
  if (cachedJwks && cachedJwksUrl === url) {
    return cachedJwks;
  }
  cachedJwks = jose.createRemoteJWKSet(new URL(url));
  cachedJwksUrl = url;
  return cachedJwks;
}

/** Reset JWKS cache (unit tests). */
export function resetServiceJwtJwksCache(): void {
  cachedJwks = null;
  cachedJwksUrl = null;
}

export function serviceJwtRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SERVICE_JWT_REQUIRED === "true" || env.SERVICE_JWT_REQUIRED === "1";
}

export function resolveServiceJwtOptions(
  env: NodeJS.ProcessEnv = process.env,
): ServiceJwtVerifierOptions | null {
  const base = env.KEYCLOAK_BASE_URL?.replace(/\/$/, "");
  const realm = env.KEYCLOAK_REALM;
  if (!base || !realm) {
    return null;
  }
  const jwksUrl =
    env.KEYCLOAK_JWKS_URL ??
    `${base}/realms/${realm}/protocol/openid-connect/certs`;
  const issuer = env.KEYCLOAK_ISSUER ?? `${base}/realms/${realm}`;
  return {
    jwksUrl,
    issuer,
    audienceClientId: env.KEYCLOAK_SERVICE_CLIENT_ID,
    roleClaim: resolveRoleClaimPath(env),
  };
}

export async function verifyServiceAccessToken(
  token: string,
  options: ServiceJwtVerifierOptions,
  /** Test hook — pass createLocalJWKSet; production uses remote JWKS. */
  getKey?: jose.JWTVerifyGetKey,
): Promise<AuthClaims> {
  const key = getKey ?? jwksFor(options.jwksUrl);
  const { payload } = await jose.jwtVerify(token, key, {
    issuer: options.issuer,
  });
  const roles = rolesAtClaimPath(
    payload,
    options.roleClaim ?? DEFAULT_OIDC_ROLE_CLAIM,
  );
  const azp = typeof payload.azp === "string" ? payload.azp : "";
  const clientId =
    typeof (payload as { client_id?: unknown }).client_id === "string"
      ? (payload as { client_id: string }).client_id
      : "";
  const hasServiceRole = roles.includes("service");
  const azpOk =
    !options.audienceClientId ||
    azp === options.audienceClientId ||
    clientId === options.audienceClientId;
  if (!hasServiceRole && !azpOk) {
    throw new Error("service_jwt_missing_service_role");
  }
  if (!hasServiceRole && azpOk) {
    roles.push("service");
  }
  return {
    sub: typeof payload.sub === "string" ? payload.sub : azp || "service-account",
    roles,
    communityId: "",
    tokenUse: "service",
  };
}
