import type { ParticipantRole } from "../api/me";
import type { CallerRole } from "../auth/claims";
import { isSellerRole } from "./role-home";

/**
 * INT-243 / INT-250 / INT-252 / INT-255 — which sider links a caller may see.
 * Aligns with architecture §3.1 / §6 and Volt mockups per persona.
 * Roles come from the IdP token only (REQ-049); marketRole from GET /v1/me.
 *
 * Manager IA: Money (Home) → Community → Billing (runs, payments, reports).
 * Member Money order: Home → Balances → Invoices → My history.
 */

export type NavGroup = "Money" | "Account" | "Community" | "Billing" | "Ops";

export type NavItemDef = {
  key: string;
  /** Default label; resolveNavLabel may override per market role. */
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
    // INT-252: stays visible when Ready as Payment method / Payout account.
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
    // INT-255 — manager Reports under Billing (after Payments).
    key: "/reports",
    label: "Reports",
    to: "/reports",
    group: "Billing",
    roles: ["manager"],
  },
  {
    // INT-255 — member My history under Money (Home → Balances → Invoices → history).
    key: "/reports",
    label: "Reports",
    to: "/reports",
    group: "Money",
    roles: ["member"],
    minMemberReadiness: "TermsAccepted",
  },
  {
    key: "/operator",
    // INT-285 — short label avoids sider wrap ("Operatortools").
    label: "Operator desk",
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

function skipManagerDuplicateReports(
  roles: ReadonlyArray<string>,
  item: NavItemDef,
): boolean {
  return (
    roles.includes("manager") &&
    item.key === "/reports" &&
    item.roles.includes("member") &&
    !item.roles.includes("manager")
  );
}

function privilegedNavVisible(
  roles: ReadonlyArray<string>,
  item: NavItemDef,
): boolean | undefined {
  if (!roles.includes("manager") && !roles.includes("operator")) {
    return undefined;
  }
  if (!item.roles.includes("member")) return true;
  if (roles.includes("manager") && item.roles.includes("manager")) {
    return true;
  }
  return undefined;
}

function isNavItemVisible(
  item: NavItemDef,
  roles: ReadonlyArray<string>,
  readiness?: string,
): boolean {
  if (!hasRole(roles, item.roles)) return false;
  if (skipManagerDuplicateReports(roles, item)) return false;
  const privileged = privilegedNavVisible(roles, item);
  if (privileged === true) return true;
  if (
    roles.includes("member") &&
    hideAfterReady(readiness, item.hideWhenMemberReadinessAtLeast)
  ) {
    return false;
  }
  return readinessOk(readiness, item.minMemberReadiness);
}

/**
 * Filter nav for the signed-in principal.
 * Manager-only items ignore member readiness; member items may require terms.
 */
export function visibleNavItems(
  roles: ReadonlyArray<string>,
  readiness?: string,
): NavItemDef[] {
  return NAV_CATALOG.filter((item) => isNavItemVisible(item, roles, readiness));
}

/**
 * Volt mockup labels per market role (INT-252).
 * Managers keep "Reports"; members get "My history".
 */
function isReady(readiness?: string): boolean {
  return (READINESS_RANK[readiness ?? "Invited"] ?? 0) >= READINESS_RANK.Ready;
}

function paymentSetupLabel(
  marketRole: ParticipantRole | null | undefined,
  readiness?: string,
): string {
  // INT-269 — prosumer needs both payout and card labels.
  if (marketRole === "prosumer") {
    return isReady(readiness) ? "Payment account" : "Payouts and card";
  }
  if (isSellerRole(marketRole)) return "Payout account";
  if (isReady(readiness)) return "Payment method";
  return "Payment setup";
}

function reportsLabel(roles: ReadonlyArray<string>, fallback: string): string {
  if (roles.includes("manager")) return "Reports";
  if (roles.includes("member")) return "My history";
  return fallback;
}

export function resolveNavLabel(
  item: NavItemDef,
  opts: {
    roles: ReadonlyArray<string>;
    marketRole?: ParticipantRole | null;
    readiness?: string;
  },
): string {
  const { roles, marketRole, readiness } = opts;
  if (item.key === "/invoices" && isSellerRole(marketRole)) {
    return "Issued invoices";
  }
  if (item.key === "/payment-setup") {
    return paymentSetupLabel(marketRole, readiness);
  }
  if (item.key === "/reports") {
    return reportsLabel(roles, item.label);
  }
  return item.label;
}

/** Apply persona labels to visible items. */
export function labeledNavItems(
  items: readonly NavItemDef[],
  opts: {
    roles: ReadonlyArray<string>;
    marketRole?: ParticipantRole | null;
    readiness?: string;
  },
): Array<NavItemDef & { label: string }> {
  return items.map((item) => ({
    ...item,
    label: resolveNavLabel(item, opts),
  }));
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
