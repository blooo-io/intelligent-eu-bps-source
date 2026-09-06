import { expect, test } from "@playwright/test";
import { authSkipped, clickRadioButton, expectPageReady, loginAs } from "../helpers/auth";

/**
 * INT-218 — manager billing run (REQ-006 / UAT-006) + community settings (REQ-043).
 */
test.describe("REQ manager billing and settings", () => {
  // Sonar S1607 — skipped when E2E_SKIP_AUTH=1 (operator opt-out for local runs)
  test.skip(authSkipped(), "E2E_SKIP_AUTH=1");

  test("community settings save round-trip", async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, "manager");
    await page.goto("/community-settings");
    await expectPageReady(page, /community settings/i);
    await page.getByRole("button", { name: /save settings/i }).click();
    await expect(page.getByText(/settings saved/i)).toBeVisible({ timeout: 20_000 });
  });

  test("early billing run reaches completed status", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, "manager");
    await page.goto("/billing-runs");
    await expectPageReady(page, /billing runs/i);
    await clickRadioButton(page, /^Early$/);
    await page.getByRole("button", { name: /start run/i }).click();
    // REQ-006 / UAT-006 — hard require Run status + terminal success (no alert soft-pass).
    await expect(page.getByText(/run status/i)).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/failed with (4|5)\d\d/i)).toHaveCount(0);
    await expect(
      page.getByText(/completed|succeeded/i).first(),
    ).toBeVisible({ timeout: 60_000 });
  });
});
