import { expect, test } from "@playwright/test";
import { authSkipped, expectPageReady, loginAs } from "../helpers/auth";

/**
 * INT-218 — manager participant import (REQ-008 / UAT-008).
 * CSV shape: email,marketActorId,meterId,role (textarea, not file upload).
 */
test.describe("REQ participant import", () => {
  test.skip(authSkipped(), "E2E_SKIP_AUTH=1");

  test("CSV import creates a participant row", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, "manager");
    await page.goto("/participants");
    await expectPageReady(page, /^participants$/i);

    const suffix = Date.now().toString(36);
    const csv = [
      "email,marketActorId,meterId,role",
      `e2e-import-${suffix}@example.invalid,actor-${suffix},meter-${suffix},consumer`,
    ].join("\n");

    const csvBox = page.getByLabel(/participant csv/i);
    await expect(csvBox).toBeVisible({ timeout: 20_000 });
    await csvBox.fill(csv);
    await page.getByRole("button", { name: /^import$/i }).click();
    await expect(page.getByText(/failed with (4|5)\d\d/i)).toHaveCount(0);
    await expect(page.getByText(/imported \d+ participant/i)).toBeVisible({
      timeout: 30_000,
    });
  });
});

