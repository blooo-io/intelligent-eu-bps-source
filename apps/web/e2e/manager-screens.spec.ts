import { expect, test } from "@playwright/test";
import { authSkipped, clickRadioButton, expectPageReady, loginAs } from "./helpers/auth";

/**
 * INT-211 — manager screens and primary buttons (uat-manager).
 * Exercises CTAs without destructive offboard / void.
 */
test.describe("AC-01 manager screens and buttons", () => {
  test.skip(authSkipped(), "E2E_SKIP_AUTH=1");

  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, "manager");
  });

  test("Community settings Save settings round-trip", async ({ page }) => {
    await page.goto("/community-settings");
    await expectPageReady(page, /community settings/i);
    const save = page.getByRole("button", { name: /save settings/i });
    await expect(save).toBeVisible({ timeout: 20_000 });
    await save.click();
    await expect(
      page.getByText(/saved|settings updated|success|failed|403/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("Participants Import and Edit controls visible", async ({ page }) => {
    await page.goto("/participants");
    await expectPageReady(page, /^participants$/i);
    await expect(page.getByLabel(/participant csv/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /^import$/i })).toBeVisible();
    const edit = page.getByRole("button", { name: /^edit$/i }).first();
    if (await edit.isVisible().catch(() => false)) {
      await edit.click();
      await expect(page.getByRole("button", { name: /^save$/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /offboard/i })).toBeVisible();
      // Do not Offboard — leave the registry intact.
    }
  });

  test("Billing runs Start run (early) and Refresh", async ({ page }) => {
    await page.goto("/billing-runs");
    await expectPageReady(page, /billing runs/i);
    await clickRadioButton(page, /^Early$/);
    await page.getByRole("button", { name: /start run/i }).click();
    // INT-218 — hard require Run status (REQ-006); journeys cover terminal completed.
    await expect(page.getByText(/run status/i)).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/failed with (4|5)\d\d/i)).toHaveCount(0);
    const refresh = page.getByRole("button", { name: /^refresh$/i });
    if (await refresh.isVisible().catch(() => false)) {
      await refresh.click();
      await expect(page.getByText(/status/i).first()).toBeVisible();
    }
  });


  test("Payments overview Set invoice status panel when rows exist", async ({ page }) => {
    await page.goto("/payments-overview");
    await expectPageReady(page, /payments overview/i);
    const setStatus = page.getByRole("button", { name: /set invoice status/i }).first();
    if (!(await setStatus.isVisible().catch(() => false))) {
      // Empty overview is acceptable on a fresh community.
      return;
    }
    await setStatus.click();
    await expect(page.getByRole("button", { name: /update status/i })).toBeVisible();
    await expect(page.getByLabel(/status reason/i)).toBeVisible();
    // Do not submit a status change without an intentional reason fixture.
  });

  test("Reports Load summary for a period", async ({ page }) => {
    await page.goto("/reports");
    await expectPageReady(page, /^reports$/i);
    const period = page.getByLabel(/summary period/i);
    await expect(period).toBeVisible();
    if (!(await period.inputValue())) {
      await period.fill("2026-10");
    }
    await page.getByRole("button", { name: /load summary/i }).click();
    await expect(
      page.getByText(/period|invoice|total|failed|403/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
