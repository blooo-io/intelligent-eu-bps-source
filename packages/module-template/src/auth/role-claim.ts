/**
 * NFR-013 — role claim path is configuration, not a Keycloak-specific constant.
 * `OIDC_ROLE_CLAIM` uses dot-path syntax (`realm_access.roles`, `roles`,
 * `groups.billing`); segments cannot contain a literal dot.
 */
export const DEFAULT_OIDC_ROLE_CLAIM = "realm_access.roles";

export function resolveRoleClaimPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.OIDC_ROLE_CLAIM?.trim();
  return configured || DEFAULT_OIDC_ROLE_CLAIM;
}

/** Non-empty string roles found at `path`; anything else yields no roles. */
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
