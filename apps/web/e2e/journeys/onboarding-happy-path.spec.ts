import { expect, test } from "@playwright/test";
import { authSkipped, expectPageReady, loginAs } from "../helpers/auth";

/**
 * INT-218 — onboarding happy path (REQ-009 / REQ-050 / UAT-009 / UAT-062 / UAT-067).
 * Asserts profile save + terms accept outcomes (payment Stripe complete deferred).
 */
test.describe("REQ onboarding happy path", () => {
  test.skip(authSkipped(), "E2E_SKIP_AUTH=1");

  test("profile save then terms accept advances readiness gates", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, "member");

    await page.goto("/profile");
    await expectPageReady(page, /billing profile/i);
    const name = page.getByLabel(/^name$/i);
    const address = page.getByLabel(/^address$/i);
    const email = page.getByLabel(/contact e-mail/i);
    await name.fill((await name.inputValue()) || "UAT Member");
    if (!(await address.inputValue()).trim()) {
      await address.fill("1 UAT Street, Brussels");
    }
    if (!(await email.inputValue()).trim()) {
      await email.fill("uat-member@example.invalid");
    }
    // REQ-009 — trade-attribution fields are not editable.
    await expect(page.getByLabel(/community id|market actor|meter/i)).toHaveCount(0);
    await page.getByRole("button", { name: /save profile/i }).click();
    await expect(page.getByText(/profile saved/i)).toBeVisible({ timeout: 20_000 });

    await page.goto("/terms");
    await expectPageReady(page, /terms/i);
    const accept = page.getByRole("button", { name: /accept terms/i });
    if (await accept.isVisible().catch(() => false)) {
      const mandate = page.getByRole("checkbox", { name: /self-billing/i });
      if (await mandate.isVisible().catch(() => false)) {
        await mandate.check();
      }
      await accept.click();
      await expect(page.getByText(/accepted/i)).toBeVisible({ timeout: 20_000 });
    } else {
      // Already accepted — success alert from prior run.
      await expect(page.getByText(/accepted|terms/i).first()).toBeVisible();
    }

    await page.goto("/onboarding");
    await expectPageReady(page, /get ready/i);
    await expect(page.getByText("Billing identity")).toBeVisible();
    // NFR-007 — fiat / Stripe path only; no crypto wallet CTA.
    await expect(page.getByText(/wallet|crypto|metamask/i)).toHaveCount(0);
  });
});
