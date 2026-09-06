import { expect, test } from "@playwright/test";
import { authSkipped, expectPageReady, loginAs } from "../helpers/auth";

/**
 * INT-218 — OIDC session journeys (REQ-033 / REQ-035 / UAT-043 / UAT-045).
 */
test.describe("REQ auth OIDC session", () => {
  // Sonar S1607 — skipped when E2E_SKIP_AUTH=1 (operator opt-out for local runs)
  test.skip(authSkipped(), "E2E_SKIP_AUTH=1");

  test("hugo.petit login establishes session then Sign out returns to IdP CTA", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, "member");
    await page.goto("/");
    await expectPageReady(page, /^home$/i);
    await expect(
      page.getByTestId("home-setup").or(page.getByTestId("home-money")),
    ).toBeVisible();
    // INT-252 / INT-253 — shell badge is market role for members (Consumer/Producer).
    await expect(page.getByTestId("shell-user-roles")).toContainText(
      /consumer|producer|prosumer|member/i,
    );

    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page.getByRole("button", { name: /continue with community idp/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });
});
