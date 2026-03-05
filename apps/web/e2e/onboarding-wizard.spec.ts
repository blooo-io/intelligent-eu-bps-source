import { expect, test } from "@playwright/test";

/**
 * INT-194 / INT-193 — authenticated member journey wizard on deployed `dev`.
 * Uses Keycloak UAT fixtures (`uat-member` / Intelligent-UAT-2026!).
 * Skips when E2E_SKIP_AUTH=1 (CI auth-gate-only jobs).
 *
 * OIDC callback returns to `/` (not the deep-link). After Sign out is visible,
 * navigate to `/onboarding` explicitly.
 */
const user = process.env.E2E_UAT_MEMBER_USER ?? "uat-member";
const password = process.env.E2E_UAT_MEMBER_PASSWORD ?? "Intelligent-UAT-2026!";
const skipAuth = process.env.E2E_SKIP_AUTH === "1";

test.describe("AC-01 onboarding wizard (authenticated)", () => {
  test.skip(skipAuth, "E2E_SKIP_AUTH=1");

  test("uat-member reaches /onboarding Steps wizard", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/login");
    const signIn = page.getByRole("button", { name: /sign in with idp/i });
    await expect(signIn).toBeVisible({ timeout: 15_000 });
    await signIn.click();

    // Keycloak realm `int` login form.
    await page.locator("#username, input[name='username']").first().fill(user);
    await page.locator("#password, input[name='password']").first().fill(password);
    await page.locator("#kc-login, button[type='submit']").first().click();

    // Session established — callback lands on home, not the deep-link.
    await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible({
      timeout: 30_000,
    });

    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /get ready/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Billing identity")).toBeVisible();
    await expect(page.getByText("Accept & self-billing")).toBeVisible();
  });
});
