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
};

const KNOWN_ROLES = new Set<CallerRole>(["member", "manager", "operator", "service"]);

/** Collect billing roles from standard Keycloak claim shapes. */
export function rolesFromClaims(claims: TokenClaims): CallerRole[] {
  const raw = [
    ...(claims.realm_access?.roles ?? []),
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
