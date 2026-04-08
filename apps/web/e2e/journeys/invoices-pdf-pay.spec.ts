import { expect, test } from "@playwright/test";
import { authSkipped, expectPageReady, loginAs } from "../helpers/auth";

/**
 * INT-218 — invoices view / PDF / pay (REQ-007 / REQ-014 / REQ-039 / UAT-007 / UAT-014 / UAT-050).
 * Requires seeded open invoices for uat-member (UAT-028 / UAT-053 seed path).
 */
test.describe("REQ invoices PDF and pay", () => {
  test.skip(authSkipped(), "E2E_SKIP_AUTH=1");

  test("view invoice shows amounts without grid fees; Open PDF; Pay when open", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAs(page, "member");
    await page.goto("/invoices");
    await expectPageReady(page, /^invoices$/i);

    const empty = page.getByText(/no invoices yet/i);
    await expect(empty).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByRole("button", { name: /^view$/i }).first()).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: /^view$/i }).first().click();
    await expect(page.getByText(/energy|vat|total/i).first()).toBeVisible();
    // A20 / REQ-007 — no grid-fee lines on P2P invoices.
    await expect(page.getByText(/no grid-fee lines/i)).toBeVisible();

    const pdfPromise = page.waitForEvent("popup", { timeout: 20_000 });
    await page.getByRole("button", { name: /open pdf/i }).click();
    const popup = await pdfPromise;
    expect(popup).toBeTruthy();
    await popup!.close();

    const pay = page.getByRole("button", { name: /^pay$/i });
    if (await pay.isEnabled().catch(() => false)) {
      await pay.click();
      await expect(
        page.getByText(/payment|paid|status|checkout|hosted/i).first(),
      ).toBeVisible({ timeout: 45_000 });
    } else {
      // Already paid / not open — status must still be visible (UAT-014).
      await expect(page.getByText(/paid|open|overdue|void|status/i).first()).toBeVisible();
    }
  });
});
