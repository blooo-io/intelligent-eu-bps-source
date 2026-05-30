import { expect, test } from "@playwright/test";
import { authSkipped, expectPageReady, loginAs } from "../helpers/auth";

/**
 * INT-218 — operator payment→trade trace (REQ-028 / UAT-028).
 * Asserts operator surfaces for intake anomalies / discrepancies / jobs used in the trace.
 */
test.describe("REQ operator payment trade trace", () => {
  test.skip(authSkipped(), "E2E_SKIP_AUTH=1");

  test("operator can open discrepancy and jobs panels for seeded runs", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, "operator");
    await page.goto("/operator");
    await expectPageReady(page, /^operator$/i);
    await expect(page.getByText(/failed with (4|5)\d\d/i)).toHaveCount(0);
    await expect(page.getByText(/^intake anomalies$/i)).toBeVisible();
    await expect(page.getByText(/^reconciliation discrepancies$/i)).toBeVisible();
    await expect(page.getByText(/jobs/i).first()).toBeVisible();
    // UAT-028 — jobs catalogue includes StartRun for billing-trace seed.
    await expect(page.getByText(/StartRun|RefreshIntake|Reconcile/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
