import { expect, test } from "@playwright/test";
import { authSkipped, expectPageReady, loginAs } from "./helpers/auth";

/**
 * INT-211 / INT-149 — operator anomalies, discrepancies and jobs on live `dev`.
 */
test.describe("AC-01 operator screens and buttons", () => {
  test.skip(authSkipped(), "E2E_SKIP_AUTH=1");
  test.describe.configure({ mode: "serial" });

  test("Operator lists load and Job Run is available when jobs exist", async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, "operator");
    await page.goto("/operator");
    await expectPageReady(page, /^operator$/i);

    // Card titles only (page description must not repeat these phrases — INT-246/247).
    await expect(page.getByText("Intake anomalies", { exact: true })).toBeVisible();
    await expect(page.getByText("Reconciliation discrepancies", { exact: true })).toBeVisible();
    await expect(page.getByText("Jobs", { exact: true })).toBeVisible();

    // No hard crash / blank content.
    await expect(page.getByTestId("page-frame")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");

    const run = page.getByRole("button", { name: /^run$/i }).first();
    if (await run.isVisible().catch(() => false)) {
      await run.click();
      // Job dispatch may succeed or report an API message — page must stay usable.
      await expect(page.getByTestId("page-frame")).toBeVisible();
    }
  });
});
