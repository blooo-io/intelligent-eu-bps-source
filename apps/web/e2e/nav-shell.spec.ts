import { expect, test } from "@playwright/test";
import { authSkipped, expectPageReady, loginAs, NAV_ROUTES } from "./helpers/auth";

/**
 * INT-211 / UAT-064 — every sider nav item loads its page on the live cluster.
 * Roles are not hidden client-side; any auth user can open every route.
 */
test.describe("AC-01 shell navigation (authenticated)", () => {
  test.skip(authSkipped(), "E2E_SKIP_AUTH=1");
  test.describe.configure({ mode: "serial" });

  test("uat-member can open every nav route and Sign out", async ({ page }) => {
    test.setTimeout(180_000);
    await loginAs(page, "member");

    for (const route of NAV_ROUTES) {
      await page.getByRole("link", { name: route.label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${route.path.replace("/", "\\/")}\\/?$`));
      await expectPageReady(page, route.heading);
      // No unhandled error banner from a hard crash (API 403 may still show — OK).
      await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
    }

    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page.getByRole("button", { name: /sign in with idp/i })).toBeVisible({
      timeout: 30_000,
    });
    expect(page.url()).toMatch(/\/login\/?$/);
  });
});
