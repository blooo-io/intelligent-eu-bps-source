import type { CallerRole } from "../auth/claims";

/**
 * INT-243 — which sider links a caller may see.
 * Aligns with architecture §3.1 / §6 (member vs manager vs operator screens).
 * Roles come from the IdP token only (REQ-049).
 */

export type NavItemDef = {
  key: string;
  label: string;
  to: string;
  /** IdP roles that may see this item (any match). */
  roles: ReadonlyArray<CallerRole>;
  /**
   * When set, members need at least this readiness before the link appears.
   * Managers/operators ignore readiness for their role-specific items.
   */
  minMemberReadiness?: "TermsAccepted" | "Ready";
};

export const NAV_CATALOG: readonly NavItemDef[] = [
  { key: "/", label: "Home", to: "/", roles: ["member", "manager", "operator"] },
  {
    key: "/onboarding",
    label: "Get ready",
    to: "/onboarding",
    roles: ["member"],
  },
  {
    key: "/profile",
    label: "Profile",
    to: "/profile",
    roles: ["member", "manager"],
  },
  { key: "/terms", label: "Terms", to: "/terms", roles: ["member"] },
  {
    key: "/payment-setup",
    label: "Payment setup",
    to: "/payment-setup",
    roles: ["member"],
  },
  {
    key: "/balances",
    label: "Balances",
    to: "/balances",
    roles: ["member"],
    minMemberReadiness: "TermsAccepted",
  },
  {
    key: "/invoices",
    label: "Invoices",
    to: "/invoices",
    roles: ["member"],
    minMemberReadiness: "TermsAccepted",
  },
  { key: "/privacy", label: "Privacy", to: "/privacy", roles: ["member"] },
  {
    key: "/community-settings",
    label: "Community settings",
    to: "/community-settings",
    roles: ["manager"],
  },
  {
    key: "/participants",
    label: "Participants",
    to: "/participants",
    roles: ["manager"],
  },
  {
    key: "/billing-runs",
    label: "Billing runs",
    to: "/billing-runs",
    roles: ["manager"],
  },
  {
    key: "/payments-overview",
    label: "Payments overview",
    to: "/payments-overview",
    roles: ["manager"],
  },
  {
    key: "/reports",
    label: "Reports",
    to: "/reports",
    roles: ["manager", "member"],
    minMemberReadiness: "TermsAccepted",
  },
  {
    key: "/operator",
    label: "Operator",
    to: "/operator",
    roles: ["operator"],
  },
] as const;

const READINESS_RANK: Record<string, number> = {
  Invited: 0,
  ProfileCompleted: 1,
  TermsAccepted: 2,
  Ready: 3,
};

function hasRole(
  roles: ReadonlyArray<string>,
  allowed: ReadonlyArray<CallerRole>,
): boolean {
  return allowed.some((r) => roles.includes(r));
}

function readinessOk(
  readiness: string | undefined,
  min: "TermsAccepted" | "Ready" | undefined,
): boolean {
  if (!min) return true;
  const have = READINESS_RANK[readiness ?? "Invited"] ?? 0;
  return have >= (READINESS_RANK[min] ?? 0);
}

/**
 * Filter nav for the signed-in principal.
 * Manager-only items ignore member readiness; member items may require terms.
 */
export function visibleNavItems(
  roles: ReadonlyArray<string>,
  readiness?: string,
): NavItemDef[] {
  return NAV_CATALOG.filter((item) => {
    if (!hasRole(roles, item.roles)) return false;
    // Manager/operator accessing a shared item (e.g. Home) — no readiness gate.
    if (roles.includes("manager") || roles.includes("operator")) {
      if (!item.roles.includes("member")) return true;
      // Shared member+manager item (Reports): managers always see it.
      if (roles.includes("manager") && item.roles.includes("manager")) {
        return true;
      }
    }
    return readinessOk(readiness, item.minMemberReadiness);
  });
}
