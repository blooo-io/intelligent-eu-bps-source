import { expect, test } from "@playwright/test";

/**
 * Unauthenticated auth-gate smoke (INT-182 / UAT-043 / INT-181 regression).
 * Would have failed when Refine `<Authenticated>` left `/` blank.
 */
test.describe("AC-01 auth gate (unauthenticated)", () => {
  test("GET / redirects to login UI with Sign in with IdP", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /sign in with idp/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: /intelligent billing/i })).toBeVisible();
    expect(page.url()).toMatch(/\/login\/?$/);
  });

  test("GET /login shows the IdP CTA (REQ-033)", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /sign in with idp/i })).toBeVisible({
      timeout: 15_000,
    });
    // No password field in this app (REQ-033).
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });
});
