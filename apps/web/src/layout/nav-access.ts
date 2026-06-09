import type { CallerRole } from "../auth/claims";

/**
 * INT-243 / INT-250 — which sider links a caller may see.
 * Aligns with architecture §3.1 / §6 (member vs manager vs operator screens).
 * Roles come from the IdP token only (REQ-049).
 * INT-250: grouped labels + progressive disclosure (setup vs money).
 */

export type NavGroup = "Money" | "Account" | "Community" | "Billing" | "Ops";

export type NavItemDef = {
  key: string;
  label: string;
  to: string;
  group: NavGroup;
  /** IdP roles that may see this item (any match). */
  roles: ReadonlyArray<CallerRole>;
  /**
   * When set, members need at least this readiness before the link appears.
   * Managers/operators ignore readiness for their role-specific items.
   */
  minMemberReadiness?: "TermsAccepted" | "Ready";
  /**
   * When set, hide this item once the member has reached this readiness
   * (setup links disappear after Ready).
   */
  hideWhenMemberReadinessAtLeast?: "Ready";
};

export const NAV_CATALOG: readonly NavItemDef[] = [
  {
    key: "/",
    label: "Home",
    to: "/",
    group: "Money",
    roles: ["member", "manager", "operator"],
  },
  {
    key: "/onboarding",
    label: "Get ready",
    to: "/onboarding",
    group: "Account",
    roles: ["member"],
    hideWhenMemberReadinessAtLeast: "Ready",
  },
  {
    key: "/profile",
    label: "Profile",
    to: "/profile",
    group: "Account",
    roles: ["member", "manager"],
    hideWhenMemberReadinessAtLeast: "Ready",
  },
  {
    key: "/terms",
    label: "Terms",
    to: "/terms",
    group: "Account",
    roles: ["member"],
    hideWhenMemberReadinessAtLeast: "Ready",
  },
  {
    key: "/payment-setup",
    label: "Payment setup",
    to: "/payment-setup",
    group: "Account",
    roles: ["member"],
    hideWhenMemberReadinessAtLeast: "Ready",
  },
  {
    key: "/balances",
    label: "Balances",
    to: "/balances",
    group: "Money",
    roles: ["member"],
    minMemberReadiness: "TermsAccepted",
  },
  {
    key: "/invoices",
    label: "Invoices",
    to: "/invoices",
    group: "Money",
    roles: ["member"],
    minMemberReadiness: "TermsAccepted",
  },
  {
    key: "/privacy",
    label: "Privacy",
    to: "/privacy",
    group: "Account",
    roles: ["member"],
  },
  {
    key: "/community-settings",
    label: "Settings",
    to: "/community-settings",
    group: "Community",
    roles: ["manager"],
  },
  {
    key: "/participants",
    label: "Members",
    to: "/participants",
    group: "Community",
    roles: ["manager"],
  },
  {
    key: "/billing-runs",
    label: "Billing runs",
    to: "/billing-runs",
    group: "Billing",
    roles: ["manager"],
  },
  {
    key: "/payments-overview",
    label: "Payments",
    to: "/payments-overview",
    group: "Billing",
    roles: ["manager"],
  },
  {
    key: "/reports",
    label: "Reports",
    to: "/reports",
    group: "Money",
    roles: ["manager", "member"],
    minMemberReadiness: "TermsAccepted",
  },
  {
    key: "/operator",
    label: "Operator tools",
    to: "/operator",
    group: "Ops",
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

function hideAfterReady(
  readiness: string | undefined,
  hideAt: "Ready" | undefined,
): boolean {
  if (!hideAt) return false;
  const have = READINESS_RANK[readiness ?? "Invited"] ?? 0;
  return have >= (READINESS_RANK[hideAt] ?? 0);
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
    if (
      roles.includes("member") &&
      hideAfterReady(readiness, item.hideWhenMemberReadinessAtLeast)
    ) {
      return false;
    }
    return readinessOk(readiness, item.minMemberReadiness);
  });
}

/** Group visible nav items in display order (INT-250). */
export function navItemsByGroup(
  items: readonly NavItemDef[],
): Array<{ group: NavGroup; items: NavItemDef[] }> {
  const order: NavGroup[] = ["Money", "Account", "Community", "Billing", "Ops"];
  const byGroup = new Map<NavGroup, NavItemDef[]>();
  for (const item of items) {
    const list = byGroup.get(item.group) ?? [];
    list.push(item);
    byGroup.set(item.group, list);
  }
  return order
    .filter((g) => (byGroup.get(g)?.length ?? 0) > 0)
    .map((g) => ({ group: g, items: byGroup.get(g) ?? [] }));
}
