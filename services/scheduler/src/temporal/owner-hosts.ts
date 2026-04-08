/**
 * INT-216 — map catalogue ownerModule codes (AC-xx) to in-cluster Service DNS.
 */
export const OWNER_MODULE_HOSTS: Record<string, string> = {
  "AC-04": "trade-intake",
  "AC-05": "settlement",
  "AC-06": "invoicing",
  "AC-08": "reconciliation",
  "AC-09": "reporting",
  "AC-10": "publication",
  "AC-12": "compliance",
  "AC-13": "reference-data",
  // Allow service chart names in tests / alternate wiring.
  settlement: "settlement",
  "trade-intake": "trade-intake",
  invoicing: "invoicing",
  reconciliation: "reconciliation",
  reporting: "reporting",
  publication: "publication",
  compliance: "compliance",
  "reference-data": "reference-data",
};

export function resolveOwnerHost(ownerModule: string): string {
  const host = OWNER_MODULE_HOSTS[ownerModule];
  if (!host) {
    throw new Error(`unknown_owner_module:${ownerModule}`);
  }
  return host;
}
