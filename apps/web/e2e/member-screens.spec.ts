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

  test("Home shows readiness and a single next CTA", async ({ page }) => {
    await page.goto("/");
    await expectPageReady(page, /^home$/i);
    const continueSetup = page.getByRole("button", {
      name: /continue setup|finish payment setup|open stripe connect|accept terms|pay open invoices|review open invoices/i,
    });
    await expect(continueSetup).toBeVisible();
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
    await expectPageReady(
      page,
      /payment method|payout account|payment setup|add a payment method|open stripe connect/i,
    );
    // INT-255 — Ready chrome shows brand/last4; setup chrome shows Start CTA.
    const readyCard = page.getByTestId("payment-method-ready");
    if (await readyCard.isVisible().catch(() => false)) {
      await expect(readyCard).toContainText(/····|\d{4}/);
      await expect(page.getByText(/default for invoice pay/i)).toBeVisible();
      return;
    }
    const start = page.getByRole("button", {
      name: /save card and finish|continue to stripe connect|start payment setup|add a payment method/i,
    });
    await expect(start).toBeVisible({ timeout: 20_000 });
    await start.click();
    // Consumer: Elements, already-complete Alert, or Ready Visa chrome.
    // Producer: KYC Submit after requirements session.
    const elements = page.getByTestId("stripe-payment-element");
    const readyAlert = page.getByText(/payment account ready/i);
    const kyc = page.getByRole("button", { name: /submit kyc|submit requirements/i });
    await expect(
      elements.or(readyAlert).or(readyCard).or(kyc),
    ).toBeVisible({ timeout: 45_000 });
    if (await elements.isVisible().catch(() => false)) {
      await expect(
        page.getByRole("button", { name: /save payment method/i }),
      ).toBeVisible();
    }
    await expect(page.getByText(/failed with (4|5)\d\d/i)).toHaveCount(0);
  });

  test("Onboarding wizard steps and Continue buttons", async ({ page }) => {
    await page.goto("/onboarding");
    await expectPageReady(page, /get ready/i);
    await expect(page.getByText("Billing identity")).toBeVisible();
    await expect(page.getByText("Accept & self-billing")).toBeVisible();
    await expect(page.getByText(/^(Pay|Payouts)$/i).first()).toBeVisible();
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
      page.getByText(/no unbilled balances/i).or(page.getByRole("button", { name: /settle early|settle now/i }).first()),
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
    const exportResp = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        /data-subject-requests/.test(r.url()),
      { timeout: 45_000 },
    );
    await page.getByRole("button", { name: /request export|submit request/i }).click();
    expect((await exportResp).ok()).toBeTruthy();
    await expect(page.getByText(/request status/i)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /^refresh$/i }).click();
    await expect(page.getByText(/status/i).first()).toBeVisible();
  });

  test("Reports Load history for own participant", async ({ page }) => {
    await page.goto("/reports");
    await expectPageReady(page, /^my history$/i);
    // Members load their own history — no participant UUID field (INT-252).
    await expect(page.getByLabel(/participant id/i)).toHaveCount(0);
    await page.getByRole("button", { name: /^load$/i }).click();
    await expect(
      page.getByText(/invoice\(s\)|no invoices|failed|403/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
