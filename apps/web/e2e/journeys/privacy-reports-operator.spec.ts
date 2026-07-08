import { expect, test } from "@playwright/test";
import { authSkipped, clickRadioButton, expectPageReady, loginAs } from "../helpers/auth";

/**
 * INT-218 — privacy (REQ-013), reports (REQ-031/032), operator (REQ-041 / UAT-052).
 */
test.describe("REQ privacy reports operator", () => {
  test.skip(authSkipped(), "E2E_SKIP_AUTH=1");

  test("privacy export request returns status", async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, "member");
    await page.goto("/privacy");
    await expectPageReady(page, /privacy/i);
    await clickRadioButton(page, /export/i);
    const exportResp = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        /\/v1\/data-subject-requests$/.test(new URL(r.url()).pathname),
      { timeout: 45_000 },
    );
    await page.getByRole("button", { name: /request export|submit request/i }).click();
    const res = await exportResp;
    expect(res.ok(), `onboarding-style: export HTTP ${res.status()}`).toBeTruthy();
    // Wait for UI before reading the body — status card or error (INT-256).
    const statusCard = page.getByTestId("privacy-request-status");
    const errAlert = page.getByTestId("privacy-request-error");
    await expect(statusCard.or(errAlert)).toBeVisible({ timeout: 20_000 });
    if (await errAlert.isVisible().catch(() => false)) {
      throw new Error(`privacy export UI error: ${await errAlert.innerText()}`);
    }
    const body = (await res.json()) as {
      requestId?: string;
      type?: string;
      status?: string;
    };
    expect(body.requestId).toBeTruthy();
    expect(body.type).toBe("export");
    expect(body.status).toBeTruthy();
    await expect(statusCard).toContainText(body.requestId!);
    await expect(statusCard).toContainText(/export/i);
    await expect(page.getByText(/failed with (4|5)\d\d/i)).toHaveCount(0);
  });

  test("member load history and manager load summary", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, "member");
    await page.goto("/reports");
    await expectPageReady(page, /^my history$/i);
    await expect(page.getByLabel(/participant id/i)).toHaveCount(0);
    const historyResp = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        /\/v1\/participants\/[^/]+\/history/.test(r.url()),
      { timeout: 45_000 },
    );
    await page.getByRole("button", { name: /^load$/i }).click();
    expect((await historyResp).ok()).toBeTruthy();
    await expect(page.getByText(/failed with (4|5)\d\d/i)).toHaveCount(0);
    await expect(page.getByTestId("history-summary")).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page.getByRole("button", { name: /continue with community idp/i })).toBeVisible({
      timeout: 30_000,
    });

    await loginAs(page, "manager");
    await page.goto("/reports");
    await expectPageReady(page, /^community reports$|^reports$/i);
    const period = page.getByLabel(/summary period/i);
    if (!(await period.inputValue())) await period.fill("2026-10");
    await page.getByRole("button", { name: /load summary/i }).click();
    await expect(page.getByText(/failed with (4|5)\d\d/i)).toHaveCount(0);
    await expect(page.getByText(/period|invoice|total/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("operator discrepancies and jobs sections load", async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, "operator");
    await page.goto("/operator");
    await expectPageReady(page, /^operator|operator desk$/i);
    await expect(page.getByText("Intake anomalies", { exact: true })).toBeVisible();
    await expect(page.getByText("Reconciliation discrepancies", { exact: true })).toBeVisible();
    await expect(page.getByText("Jobs", { exact: true })).toBeVisible();
  });
});
