import { expect, test } from "@playwright/test";
import { authSkipped, expectPageReady, loginAs } from "../helpers/auth";

/**
 * INT-218 — early settlement (REQ-057 / UAT-074).
 * Prefer Settle now when unbilled rows exist; otherwise assert empty state clearly.
 */
test.describe("REQ balances settle now", () => {
  test.skip(authSkipped(), "E2E_SKIP_AUTH=1");

  test("balances load without 404; Settle now when rows exist", async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, "member");
    await page.goto("/balances");
    await expectPageReady(page, /^balances$/i);

    await expect(page.getByText(/failed with 404/i)).toHaveCount(0);
    await expect(page.getByText(/failed with (4|5)\d\d/i)).toHaveCount(0);

    const settle = page.getByRole("button", { name: /settle now/i }).first();
    const empty = page.getByText(/no unbilled balances/i);
    const hasSettle = await settle.isVisible().catch(() => false);
    const hasEmpty = await empty.isVisible().catch(() => false);
    expect(hasSettle || hasEmpty).toBeTruthy();

    if (hasSettle) {
      await settle.click();
      await expect(
        page.getByText(/early settlement|run status|completed|succeeded/i).first(),
      ).toBeVisible({ timeout: 45_000 });
      await expect(page.getByText(/failed with (4|5)\d\d/i)).toHaveCount(0);
    }
  });
});
