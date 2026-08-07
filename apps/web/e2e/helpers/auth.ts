import { expect, type Page } from "@playwright/test";

/**
 * INT-211 / INT-282 — shared Keycloak login for deployed-stack E2E.
 * Human-readable fixtures (ids unchanged from INT-194 / INT-236).
 */
export type UatRole = "member" | "manager" | "operator" | "s1-consumer";

const DEFAULT_PASSWORD = "Intelligent-UAT-2026!";

const USERS: Record<UatRole, { envUser: string; envPass: string; fallback: string }> = {
  member: {
    envUser: "E2E_UAT_MEMBER_USER",
    envPass: "E2E_UAT_MEMBER_PASSWORD",
    fallback: "hugo.petit",
  },
  manager: {
    envUser: "E2E_UAT_MANAGER_USER",
    envPass: "E2E_UAT_MANAGER_PASSWORD",
    fallback: "sofia.garcia",
  },
  operator: {
    envUser: "E2E_UAT_OPERATOR_USER",
    envPass: "E2E_UAT_OPERATOR_PASSWORD",
    fallback: "paul.nguyen",
  },
  /** INT-251 / INT-282 — Léa Martin (S1 consumer, c0ffee… community). */
  "s1-consumer": {
    envUser: "E2E_S1_CONSUMER_USER",
    envPass: "E2E_S1_CONSUMER_PASSWORD",
    fallback: "lea.martin",
  },
};

export function uatCredentials(role: UatRole): { user: string; password: string } {
  const meta = USERS[role];
  return {
    user: process.env[meta.envUser]?.trim() || meta.fallback,
    password: process.env[meta.envPass]?.trim() || DEFAULT_PASSWORD,
  };
}

export function authSkipped(): boolean {
  return process.env.E2E_SKIP_AUTH === "1";
}

/** Sign in via IdP and wait until the authenticated shell is ready. */
export async function loginAs(page: Page, role: UatRole): Promise<void> {
  const { user, password } = uatCredentials(role);

  await page.goto("/login");
  const signIn = page.getByRole("button", { name: /continue with community idp/i });
  await expect(signIn).toBeVisible({ timeout: 15_000 });
  await signIn.click();

  await page.locator("#username, input[name='username']").first().fill(user);
  await page.locator("#password, input[name='password']").first().fill(password);
  await page.locator("#kc-login, button[type='submit']").first().click();

  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible({
    timeout: 45_000,
  });
}

/** Wait until PageFrame content (not the loading spinner) is shown. */
export async function expectPageReady(page: Page, heading: RegExp | string): Promise<void> {
  await expect(page.getByTestId("page-frame").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible({
    timeout: 15_000,
  });
}

/** Ant Design Radio.Button hides the native input — click the visible wrapper. */
export async function clickRadioButton(page: Page, label: RegExp | string): Promise<void> {
  await page.locator(".ant-radio-button-wrapper", { hasText: label }).first().click();
}

/** Full catalogue (legacy); prefer role-specific lists after INT-243. */
export const NAV_ROUTES: ReadonlyArray<{ label: string; path: string; heading: RegExp }> = [
  { label: "Home", path: "/", heading: /billing home|community console|operator desk|^home$/i },
  { label: "Get ready", path: "/onboarding", heading: /get ready/i },
  { label: "Profile", path: "/profile", heading: /billing profile/i },
  { label: "Terms", path: "/terms", heading: /terms/i },
  { label: "Payment setup", path: "/payment-setup", heading: /payment setup|payment method|payout account/i },
  { label: "Balances", path: "/balances", heading: /^balances$/i },
  { label: "Invoices", path: "/invoices", heading: /^invoices$|^issued invoices$/i },
  { label: "Privacy", path: "/privacy", heading: /privacy/i },
  { label: "Community settings", path: "/community-settings", heading: /community settings/i },
  { label: "Participants", path: "/participants", heading: /^participants$|^members$/i },
  { label: "Billing runs", path: "/billing-runs", heading: /billing runs/i },
  { label: "Payments overview", path: "/payments-overview", heading: /payments overview/i },
  { label: "Reports", path: "/reports", heading: /^reports$|^my history$|^community reports$/i },
  { label: "Operator", path: "/operator", heading: /^operator|operator desk|operator tools/i },
];

/**
 * Member sider money/account routes (INT-243 / INT-250 / INT-252 / INT-253).
 * Setup links hide after Ready; payment label depends on readiness + market role.
 */
export const MEMBER_NAV_ROUTES: ReadonlyArray<{
  /** Exact link name, or several alternatives (Consumer Ready vs setup vs Producer). */
  label: string | ReadonlyArray<string>;
  path: string;
  heading: RegExp;
}> = [
  { label: "Home", path: "/", heading: /^home$/i },
  { label: "Balances", path: "/balances", heading: /^balances$/i },
  { label: "Invoices", path: "/invoices", heading: /^invoices$|^issued invoices$/i },
  {
    label: ["Payment method", "Payment setup", "Payout account"],
    path: "/payment-setup",
    heading: /payment method|payment setup|payout account/i,
  },
  { label: "Privacy", path: "/privacy", heading: /privacy/i },
  { label: "My history", path: "/reports", heading: /^my history$/i },
];

export const MANAGER_ONLY_LABELS = [
  /^settings$/i,
  /^members$/i,
  /billing runs/i,
  /^payments$/i,
  /operator tools/i,
] as const;
