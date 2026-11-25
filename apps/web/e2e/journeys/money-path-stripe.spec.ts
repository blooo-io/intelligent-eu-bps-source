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
 * Uses S1 consumer (Horizon Energy), not hugo.petit — seed invoices from
 * stripe-fresh-billing-run land on participant 11111111-… (INT-236 / INT-238).
 */
function freshInvoiceIds(): string[] {
  return (process.env.E2E_FRESH_INVOICE_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

test.describe("INT-251 Stripe money path", () => {
  // Sonar S1607 — skipped when E2E_SKIP_AUTH=1 (operator opt-out for local runs)
  test.skip(authSkipped(), "E2E_SKIP_AUTH=1");

  test("Pay open invoice creates a succeeded Stripe charge", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const stripeKey = requireStripeSecretKey(process.env);
    const createdAfter = Math.floor(Date.now() / 1000) - 5;

    // INT-368 — pay only invoices the seed created this run; an older Open row
    // may already be paid on Stripe and can never yield a new charge.
    const fresh = freshInvoiceIds();
    expect(
      fresh.length,
      "INT-251: E2E_FRESH_INVOICE_IDS required (stripe-fresh-billing-run)",
    ).toBeGreaterThan(0);

    await loginAs(page, "s1-consumer");
    await page.goto("/invoices");
    await expectPageReady(page, /^invoices$|^issued invoices$/i);

    await expect(page.getByText(/no invoices yet/i)).toHaveCount(0, {
      timeout: 20_000,
    });

    // INT-444 — Léa accumulates ~100 invoice rows on dev; clicking every View
    // while InvoicesPage `busy` disables siblings burns 20s waits and hits the
    // 180s test timeout after Pay. Open only seed-fresh ids via Ant rowKey
    // (table shows legalNumber, not the UUID).
    let invoiceId: string | null = null;
    for (const candidateId of fresh) {
      const row = page.locator(`tr[data-row-key="${candidateId}"]`);
      await expect(
        row,
        `fresh invoice ${candidateId} must appear in the list`,
      ).toBeVisible({ timeout: 20_000 });
      await row.scrollIntoViewIfNeeded();

      const detail = page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          res.ok() &&
          new URL(res.url()).pathname.endsWith(`/v1/invoices/${candidateId}`),
        { timeout: 20_000 },
      );
      await row.getByRole("button", { name: /^view$/i }).click();
      const detailRes = await detail;
      const detailBody = (await detailRes.json()) as { status?: string };
      // Prefer the detail payload — the table has many <code> status cells.
      if (!/^Open$/i.test((detailBody.status ?? "").trim())) {
        continue;
      }

      const pay = page.getByRole("button", { name: /^pay$/i });
      await expect(pay).toBeEnabled({ timeout: 10_000 });

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
