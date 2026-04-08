import { expect, test } from "@playwright/test";
import { authSkipped, expectPageReady, loginAs } from "../helpers/auth";

/**
 * INT-218 — manager payments overview (REQ-016 / REQ-018 area).
 */
test.describe("REQ payments overview", () => {
  test.skip(authSkipped(), "E2E_SKIP_AUTH=1");

  test("overview loads invoice rows or empty state without API errors", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, "manager");
    await page.goto("/payments-overview");
    await expectPageReady(page, /payments overview/i);
    await expect(page.getByText(/failed with (4|5)\d\d/i)).toHaveCount(0);
    // Page must render overview chrome even when the community has no invoices yet.
    await expect(
      page.getByText(/invoice|payment|overview|status/i).first(),
    ).toBeVisible({ timeout: 20_000 });
    const setStatus = page.getByRole("button", { name: /set invoice status/i }).first();
    if (await setStatus.isVisible().catch(() => false)) {
      await setStatus.click();
      await expect(page.getByRole("button", { name: /update status/i })).toBeVisible();
      await expect(page.getByLabel(/status reason/i)).toBeVisible();
    }
  });
});

