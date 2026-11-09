/**
 * Map IdP token claims to billing roles and community (REQ-049, UAT-060).
 * APISIX / Keycloak put role and community on the access token; we never
 * invent them client-side beyond what the IdP issued.
 */

export type CallerRole = "member" | "manager" | "operator" | "service";

export type TokenClaims = {
  sub?: string;
  /** Realm / resource roles from Keycloak. */
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
  /** Community scope claim (custom). */
  community_id?: string;
  communityId?: string;
  [claim: string]: unknown;
};

/**
 * NFR-013 — dot-path of the roles array claim (`oidcRoleClaim` in /config.json,
 * same value as the gateway `oidc.roleClaim` and module `OIDC_ROLE_CLAIM`).
 */
export const DEFAULT_ROLE_CLAIM = "realm_access.roles";

const KNOWN_ROLES = new Set<CallerRole>(["member", "manager", "operator", "service"]);

/** String roles found at a dot-path; a missing or non-array claim yields none. */
export function rolesAtClaimPath(claims: unknown, path: string): string[] {
  let node: unknown = claims;
  for (const segment of path.split(".")) {
    if (!segment || node === null || typeof node !== "object" || Array.isArray(node)) {
      return [];
    }
    node = (node as Record<string, unknown>)[segment];
  }
  if (!Array.isArray(node)) return [];
  return node.filter((r): r is string => typeof r === "string" && r !== "");
}

/** Collect billing roles from the configured claim plus Keycloak client roles. */
export function rolesFromClaims(
  claims: TokenClaims,
  roleClaim: string = DEFAULT_ROLE_CLAIM,
): CallerRole[] {
  const raw = [
    ...rolesAtClaimPath(claims, roleClaim),
    ...Object.values(claims.resource_access ?? {}).flatMap((r) => r.roles ?? []),
  ];
  const found = new Set<CallerRole>();
  for (const role of raw) {
    if (KNOWN_ROLES.has(role as CallerRole)) {
      found.add(role as CallerRole);
    }
  }
  return [...found];
}

/** Community id from token claims (own-community only — REQ-010 / REQ-049). */
export function communityIdFromClaims(claims: TokenClaims): string | undefined {
  return claims.community_id ?? claims.communityId;
}
