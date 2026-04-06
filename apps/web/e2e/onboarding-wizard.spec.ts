import { expect, test } from "@playwright/test";
import { authSkipped, expectPageReady, loginAs } from "./helpers/auth";

/**
 * INT-194 / INT-193 / INT-211 — authenticated member journey wizard on deployed `dev`.
 * Uses Keycloak UAT fixtures (`uat-member`). Skip with E2E_SKIP_AUTH=1.
 *
 * OIDC callback returns to `/` (not the deep-link). After Sign out is visible,
 * navigate to `/onboarding` explicitly.
 */
test.describe("AC-01 onboarding wizard (authenticated)", () => {
  test.skip(authSkipped(), "E2E_SKIP_AUTH=1");

  test("uat-member reaches /onboarding Steps wizard (UAT-067)", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAs(page, "member");

    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
    await expectPageReady(page, /get ready/i);
    await expect(page.getByText("Billing identity")).toBeVisible();
    await expect(page.getByText("Accept & self-billing")).toBeVisible();
  });
});
