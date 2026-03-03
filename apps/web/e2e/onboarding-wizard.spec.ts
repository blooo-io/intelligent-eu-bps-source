import { expect, test } from "@playwright/test";

/**
 * INT-194 / INT-193 — authenticated member journey wizard on deployed `dev`.
 * Uses Keycloak UAT fixtures (`uat-member` / Intelligent-UAT-2026!).
 * Skips when E2E_SKIP_AUTH=1 (CI auth-gate-only jobs).
 */
const user = process.env.E2E_UAT_MEMBER_USER ?? "uat-member";
const password = process.env.E2E_UAT_MEMBER_PASSWORD ?? "Intelligent-UAT-2026!";
const skipAuth = process.env.E2E_SKIP_AUTH === "1";

test.describe("AC-01 onboarding wizard (authenticated)", () => {
  test.skip(skipAuth, "E2E_SKIP_AUTH=1");

  test("uat-member reaches /onboarding Steps wizard", async ({ page }) => {
    await page.goto("/onboarding");
    const signIn = page.getByRole("button", { name: /sign in with idp/i });
    if (await signIn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await signIn.click();
      // Keycloak realm `int` login form.
      await page.locator("#username, input[name='username']").first().fill(user);
      await page.locator("#password, input[name='password']").first().fill(password);
      await page.locator("#kc-login, button[type='submit']").first().click();
    }

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    // Ant Design Steps — Profile / Terms / Payment (labels from wizard page).
    await expect(
      page.getByText(/profile|terms|payment|onboarding/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
