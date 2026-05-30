/**
 * INT-246 — prefer IdP token roles; if empty, use GET /v1/me roles.
 * Some UAT Keycloak clients omit realm billing roles on the access token
 * while participants still returns the correct role list on /v1/me.
 */
export function effectiveRoles(
  identityRoles: ReadonlyArray<string> | undefined,
  meRoles: ReadonlyArray<string> | undefined,
): string[] {
  if (identityRoles && identityRoles.length > 0) {
    return [...identityRoles];
  }
  if (meRoles && meRoles.length > 0) {
    return [...meRoles];
  }
  return [];
}
