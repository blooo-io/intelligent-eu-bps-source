import { expect, type Page } from "@playwright/test";

/**
 * INT-211 — shared Keycloak login for deployed-stack E2E.
 * UAT fixtures: uat-member / uat-manager / uat-operator (INT-194).
 */
export type UatRole = "member" | "manager" | "operator";

const DEFAULT_PASSWORD = "Intelligent-UAT-2026!";

const USERS: Record<UatRole, { envUser: string; envPass: string; fallback: string }> = {
  member: {
    envUser: "E2E_UAT_MEMBER_USER",
    envPass: "E2E_UAT_MEMBER_PASSWORD",
    fallback: "uat-member",
  },
  manager: {
    envUser: "E2E_UAT_MANAGER_USER",
    envPass: "E2E_UAT_MANAGER_PASSWORD",
    fallback: "uat-manager",
  },
  operator: {
    envUser: "E2E_UAT_OPERATOR_USER",
    envPass: "E2E_UAT_OPERATOR_PASSWORD",
    fallback: "uat-operator",
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
  const signIn = page.getByRole("button", { name: /sign in with idp/i });
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

export const NAV_ROUTES: ReadonlyArray<{ label: string; path: string; heading: RegExp }> = [
  { label: "Home", path: "/", heading: /^home$/i },
  { label: "Get ready", path: "/onboarding", heading: /get ready/i },
  { label: "Profile", path: "/profile", heading: /billing profile/i },
  { label: "Terms", path: "/terms", heading: /terms/i },
  { label: "Payment setup", path: "/payment-setup", heading: /payment setup/i },
  { label: "Balances", path: "/balances", heading: /^balances$/i },
  { label: "Invoices", path: "/invoices", heading: /^invoices$/i },
  { label: "Privacy", path: "/privacy", heading: /privacy/i },
  { label: "Community settings", path: "/community-settings", heading: /community settings/i },
  { label: "Participants", path: "/participants", heading: /^participants$/i },
  { label: "Billing runs", path: "/billing-runs", heading: /billing runs/i },
  { label: "Payments overview", path: "/payments-overview", heading: /payments overview/i },
  { label: "Reports", path: "/reports", heading: /^reports$/i },
  { label: "Operator", path: "/operator", heading: /^operator$/i },
];
