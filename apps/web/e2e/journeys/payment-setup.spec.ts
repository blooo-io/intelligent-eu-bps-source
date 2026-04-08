import { expect, test } from "@playwright/test";
import { authSkipped, expectPageReady, loginAs } from "../helpers/auth";

/**
 * INT-218 — payment setup / Connect path (REQ-009 payment leg / REQ-015 / UAT-015).
 */
test.describe("REQ payment setup", () => {
  test.skip(authSkipped(), "E2E_SKIP_AUTH=1");

  test("payment setup page exposes Stripe Connect or payment-method CTA", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, "member");
    await page.goto("/payment-setup");
    await expectPageReady(page, /payment/i);
    await expect(page.getByText(/failed with (4|5)\d\d/i)).toHaveCount(0);
    // REQ-015 / NFR-007 — Stripe fiat path; no crypto wallet CTA.
    await expect(page.getByText(/wallet|crypto|metamask/i)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /start payment setup/i }),
    ).toBeVisible({ timeout: 20_000 });
  });
});

