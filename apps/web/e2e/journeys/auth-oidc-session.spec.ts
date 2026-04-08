import { expect, test } from "@playwright/test";
import { authSkipped, expectPageReady, loginAs } from "../helpers/auth";

/**
 * INT-218 — OIDC session journeys (REQ-033 / REQ-035 / UAT-043 / UAT-045).
 */
test.describe("REQ auth OIDC session", () => {
  test.skip(authSkipped(), "E2E_SKIP_AUTH=1");

  test("uat-member login establishes session then Sign out returns to IdP CTA", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, "member");
    await page.goto("/");
    await expectPageReady(page, /^home$/i);
    await expect(page.getByText(/Roles from IdP|Readiness|Status:/i).first()).toBeVisible();

    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page.getByRole("button", { name: /sign in with idp/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });
});
