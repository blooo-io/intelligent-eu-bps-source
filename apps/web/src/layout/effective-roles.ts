/**
 * INT-246 / INT-250 — prefer IdP token roles; if empty, use GET /v1/me roles.
 * Some UAT Keycloak clients omit realm billing roles on the access token
 * while participants still returns the correct role list on /v1/me.
 *
 * Always strip Keycloak noise (offline_access, uma_authorization, …) so the
 * shell only shows billing roles the user understands.
 */

const BILLING_ROLES = new Set(["member", "manager", "operator", "service"]);

function billingOnly(roles: ReadonlyArray<string> | undefined): string[] {
  if (!roles?.length) return [];
  return roles.filter((r) => BILLING_ROLES.has(r));
}

export function effectiveRoles(
  identityRoles: ReadonlyArray<string> | undefined,
  meRoles: ReadonlyArray<string> | undefined,
): string[] {
  const fromIdentity = billingOnly(identityRoles);
  if (fromIdentity.length > 0) {
    return fromIdentity;
  }
  const fromMe = billingOnly(meRoles);
  if (fromMe.length > 0) {
    return fromMe;
  }
  return [];
}
