import { expect, test } from "@playwright/test";
import { authSkipped, clickRadioButton, expectPageReady, loginAs } from "../helpers/auth";

/**
 * INT-218 — privacy (REQ-013), reports (REQ-031/032), operator (REQ-041 / UAT-052).
 */
test.describe("REQ privacy reports operator", () => {
  test.skip(authSkipped(), "E2E_SKIP_AUTH=1");

  test("privacy export request returns status", async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, "member");
    await page.goto("/privacy");
    await expectPageReady(page, /privacy/i);
    await clickRadioButton(page, /export/i);
    await page.getByRole("button", { name: /submit request/i }).click();
    await expect(page.getByText(/request status/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/export/i).first()).toBeVisible();
    await expect(page.getByText(/failed with (4|5)\d\d/i)).toHaveCount(0);
  });

  test("member load history and manager load summary", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, "member");
    await page.goto("/reports");
    await expectPageReady(page, /^reports$/i);
    const participant = page.getByLabel(/participant id/i);
    await expect
      .poll(async () => (await participant.inputValue()).length > 0, { timeout: 20_000 })
      .toBeTruthy();
    await page.getByRole("button", { name: /load history/i }).click();
    await expect(page.getByText(/failed with (4|5)\d\d/i)).toHaveCount(0);
    await expect(
      page.getByText(/invoice\(s\)|no invoices|payment\(s\)/i).first(),
    ).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page.getByRole("button", { name: /sign in with idp/i })).toBeVisible({
      timeout: 30_000,
    });

    await loginAs(page, "manager");
    await page.goto("/reports");
    await expectPageReady(page, /^reports$/i);
    const period = page.getByLabel(/summary period/i);
    if (!(await period.inputValue())) await period.fill("2026-10");
    await page.getByRole("button", { name: /load summary/i }).click();
    await expect(page.getByText(/failed with (4|5)\d\d/i)).toHaveCount(0);
    await expect(page.getByText(/period|invoice|total/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("operator discrepancies and jobs sections load", async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, "operator");
    await page.goto("/operator");
    await expectPageReady(page, /^operator$/i);
    await expect(page.getByText("Intake anomalies", { exact: true })).toBeVisible();
    await expect(page.getByText("Reconciliation discrepancies", { exact: true })).toBeVisible();
    await expect(page.getByText("Jobs", { exact: true })).toBeVisible();
  });
});
