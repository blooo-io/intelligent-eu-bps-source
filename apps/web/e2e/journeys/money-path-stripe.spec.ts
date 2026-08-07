import { expect, test } from "@playwright/test";
import { authSkipped, expectPageReady, loginAs } from "../helpers/auth";
import {
  requireStripeSecretKey,
  waitForSucceededChargeForInvoice,
} from "../../src/api/stripe-money-assert";

/**
 * INT-251 — full money path with Stripe PaymentIntent / Charge assertion
 * (REQ-014 / UAT-014 / TD-6). Fails if Pay does not create a succeeded test charge.
 *
 * Uses S1 consumer (Demo community S1), not hugo.petit — seed invoices from
 * stripe-fresh-billing-run land on participant 11111111-… (INT-236 / INT-238).
 */
test.describe("INT-251 Stripe money path", () => {
  test.skip(authSkipped(), "E2E_SKIP_AUTH=1");

  test("Pay open invoice creates a succeeded Stripe charge", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const stripeKey = requireStripeSecretKey();
    const createdAfter = Math.floor(Date.now() / 1000) - 5;

    await loginAs(page, "s1-consumer");
    await page.goto("/invoices");
    await expectPageReady(page, /^invoices$|^issued invoices$/i);

    await expect(page.getByText(/no invoices yet/i)).toHaveCount(0, {
      timeout: 20_000,
    });

    // Prefer an Open row so Pay is enabled.
    const viewButtons = page.getByRole("button", { name: /^view$/i });
    await expect(viewButtons.first()).toBeVisible({ timeout: 20_000 });

    let invoiceId: string | null = null;
    const count = await viewButtons.count();
    for (let i = 0; i < count; i++) {
      await viewButtons.nth(i).click();
      const status = page.locator("code").filter({ hasText: /Open|Paid|Draft/i });
      await expect(status.first()).toBeVisible({ timeout: 10_000 });
      const statusText = (await status.first().textContent()) ?? "";
      if (/^Open$/i.test(statusText.trim())) {
        // Capture invoice id from the payment network call after Pay.
        const pay = page.getByRole("button", { name: /^pay$/i });
        await expect(pay).toBeEnabled();

        const paymentResponse = page.waitForResponse(
          (res) =>
            res.request().method() === "POST" &&
            /\/v1\/invoices\/[^/]+\/payments/.test(res.url()) &&
            res.ok(),
          { timeout: 60_000 },
        );
        await pay.click();
        const res = await paymentResponse;
        const url = res.url();
        const match = url.match(/\/v1\/invoices\/([^/]+)\/payments/);
        invoiceId = match?.[1] ?? null;
        const body = (await res.json()) as { status?: string; paymentId?: string };
        expect(body.status?.toLowerCase()).toMatch(/succeeded|pending/);
        await expect(
          page.getByText(/payment|paid|succeeded/i).first(),
        ).toBeVisible({ timeout: 30_000 });
        break;
      }
    }

    expect(
      invoiceId,
      "INT-251: need an Open invoice for the Ready consumer — seed a billing run first",
    ).toBeTruthy();

    const charge = await waitForSucceededChargeForInvoice(
      stripeKey,
      invoiceId!,
      { createdAfter, timeoutMs: 90_000, pollMs: 2_000 },
    );
    expect(charge.paid).toBe(true);
    expect(charge.status).toBe("succeeded");
    expect(charge.payment_intent).toBeTruthy();
    expect(charge.amount).toBeGreaterThan(0);
  });
});
