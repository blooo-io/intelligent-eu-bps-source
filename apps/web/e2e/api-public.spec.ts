import { expect, test } from "@playwright/test";
import { authSkipped } from "./helpers/auth";
import { runPublicApiCoverage } from "./api/run-public-api";

/**
 * INT-394 / REQ-052 — every public operation, on the deployed stack, with a
 * signed-in UAT session. Fails unless coverage of the contract is 100%.
 */
test.describe("public API e2e coverage", () => {
  test.skip(authSkipped(), "E2E_SKIP_AUTH=1");

  test("covers every public operation on the deployed API", async ({ browser }, testInfo) => {
    test.setTimeout(300_000);
    const baseURL = testInfo.project.use.baseURL;
    if (!baseURL) throw new Error("E2E_BASE_URL is required");
    const report = await runPublicApiCoverage({ browser, baseURL });
    expect(report.covered).toBe(report.total);
    expect(report.percent).toBe(100);
    console.log(
      `Public API e2e coverage ${report.covered}/${report.total} (${report.percent}%)`,
    );
  });
});
