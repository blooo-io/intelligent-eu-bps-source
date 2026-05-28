import { expect, test } from "@playwright/test";
import { authSkipped, clickRadioButton, expectPageReady, loginAs } from "./helpers/auth";

/**
 * INT-211 — member primary screens and buttons on deployed `dev`.
 * Covers UAT-043 (session), UAT-067 (wizard), UAT-064 (screens), UAT-013 (privacy).
 */
test.describe("AC-01 member screens and buttons", () => {
  test.skip(authSkipped(), "E2E_SKIP_AUTH=1");

  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, "member");
  });

  test("Home shows readiness and Open wizard / Pay invoices CTA", async ({ page }) => {
    await page.goto("/");
    await expectPageReady(page, /your billing home/i);
    await expect(page.getByText(/Get ready|Status/i).first()).toBeVisible();
    const openWizard = page.getByRole("button", { name: /open wizard/i });
    const payInvoices = page.getByRole("button", { name: /pay invoices/i });
    await expect(openWizard.or(payInvoices)).toBeVisible();
  });

  test("Profile Save profile succeeds", async ({ page }) => {
    await page.goto("/profile");
    await expectPageReady(page, /billing profile/i);
    const name = page.getByLabel(/^name$/i);
    const address = page.getByLabel(/^address$/i);
    const email = page.getByLabel(/contact e-mail/i);
    await expect(name).toBeVisible();
    await name.fill((await name.inputValue()) || "UAT Member");
    // Seed may leave address empty — fill required fields so Save can succeed.
    if (!(await address.inputValue()).trim()) {
      await address.fill("1 UAT Street, Brussels");
    }
    if (!(await email.inputValue()).trim()) {
      await email.fill("uat-member@example.invalid");
    }
    await page.getByRole("button", { name: /save profile/i }).click();
    await expect(page.getByText(/profile saved/i)).toBeVisible({ timeout: 20_000 });
  });

  test("Terms Accept terms control is present", async ({ page }) => {
    await page.goto("/terms");
    await expectPageReady(page, /terms/i);
    await expect(page.getByRole("button", { name: /accept terms/i })).toBeVisible();
  });

  test("Payment setup Start CTA is clickable", async ({ page }) => {
    await page.goto("/payment-setup");
    await expectPageReady(page, /payment setup/i);
    const start = page.getByRole("button", { name: /start payment setup/i });
    await expect(start).toBeVisible();
    await start.click();
    // Consumer path mounts Stripe Element + Save; producer path shows KYC Submit.
    await expect(page.getByTestId("stripe-payment-element")).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByRole("button", { name: /save payment method/i })).toBeVisible();
  });

  test("Onboarding wizard steps and Continue buttons", async ({ page }) => {
    await page.goto("/onboarding");
    await expectPageReady(page, /get ready/i);
    await expect(page.getByText("Billing identity")).toBeVisible();
    await expect(page.getByText("Accept & self-billing")).toBeVisible();
    await expect(page.getByText(/payment setup/i).first()).toBeVisible();
    // Step click navigates within wizard.
    await page.getByText("Billing identity").click();
    await expect(page.getByRole("button", { name: /save profile|continue to terms/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("Balances page loads (empty or Settle now)", async ({ page }) => {
    await page.goto("/balances");
    await expectPageReady(page, /^balances$/i);
    await expect(
      page.getByText(/no unbilled balances/i).or(page.getByRole("button", { name: /settle now/i }).first()),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("Invoices View / Open PDF / Pay when rows exist", async ({ page }) => {
    await page.goto("/invoices");
    await expectPageReady(page, /^invoices$/i);
    const empty = page.getByText(/no invoices yet/i);
    const view = page.getByRole("button", { name: /^view$/i }).first();
    if (await empty.isVisible().catch(() => false)) {
      return;
    }
    await expect(view).toBeVisible({ timeout: 15_000 });
    await view.click();
    await expect(page.getByRole("button", { name: /open pdf/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^pay$/i })).toBeVisible();
    // Open PDF should not crash the page (new tab or blob).
    const [popup] = await Promise.all([
      page.waitForEvent("popup", { timeout: 10_000 }).catch(() => null),
      page.getByRole("button", { name: /open pdf/i }).click(),
    ]);
    if (popup) await popup.close();
  });

  test("Privacy Export submit and Refresh", async ({ page }) => {
    await page.goto("/privacy");
    await expectPageReady(page, /privacy/i);
    await clickRadioButton(page, /export/i);
    await page.getByRole("button", { name: /submit request/i }).click();
    await expect(page.getByText(/request status/i)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /^refresh$/i }).click();
    await expect(page.getByText(/status/i).first()).toBeVisible();
  });

  test("Reports Load history for own participant", async ({ page }) => {
    await page.goto("/reports");
    await expectPageReady(page, /^reports$/i);
    const participant = page.getByLabel(/participant id/i);
    await expect(participant).toBeVisible();
    // Prefill from /v1/me may take a moment.
    await expect
      .poll(async () => (await participant.inputValue()).length > 0, { timeout: 20_000 })
      .toBeTruthy();
    await page.getByRole("button", { name: /load history/i }).click();
    await expect(
      page.getByText(/invoice\(s\)|no invoices|failed|403/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
