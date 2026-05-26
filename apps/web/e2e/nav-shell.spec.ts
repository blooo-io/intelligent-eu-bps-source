import { expect, test } from "@playwright/test";
import {
  authSkipped,
  expectPageReady,
  loginAs,
  MANAGER_ONLY_LABELS,
  MEMBER_NAV_ROUTES,
} from "./helpers/auth";

/**
 * INT-211 / INT-243 / UAT-064 — sider shows only role-appropriate routes.
 * Members must not see manager/operator links (avoids raw 403 dead-ends).
 */
test.describe("AC-01 shell navigation (authenticated)", () => {
  test.skip(authSkipped(), "E2E_SKIP_AUTH=1");
  test.describe.configure({ mode: "serial" });

  test("uat-member sees member routes only and can Sign out", async ({ page }) => {
    test.setTimeout(180_000);
    await loginAs(page, "member");

    await expect(page.getByTestId("shell-user-name")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("shell-user-roles")).toContainText(/member/i);

    for (const label of MANAGER_ONLY_LABELS) {
      await expect(page.getByRole("link", { name: label })).toHaveCount(0);
    }

    for (const route of MEMBER_NAV_ROUTES) {
      await page.getByRole("link", { name: route.label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${route.path.replace("/", "\\/")}\\/?$`));
      await expectPageReady(page, route.heading);
      await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
      await expect(page.locator("body")).not.toContainText(/failed with 403/i);
    }

    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page.getByRole("button", { name: /sign in with idp/i })).toBeVisible({
      timeout: 30_000,
    });
    expect(page.url()).toMatch(/\/login\/?$/);
  });
});
