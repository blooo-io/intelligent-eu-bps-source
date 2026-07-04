import { defineConfig, devices } from "@playwright/test";

/**
 * AC-01 browser E2E (INT-182 / UAT-043).
 *
 * Runs **only** against a fully deployed stack (gateway + web + IdP + API),
 * not a cloistered localhost build. Set E2E_BASE_URL, e.g.:
 *   E2E_BASE_URL=https://app.dev.intelligent-eu-bp.blooo.dev pnpm test:e2e
 */
const baseURL = process.env.E2E_BASE_URL?.trim();
if (!baseURL) {
  throw new Error(
    "INT-182: set E2E_BASE_URL to the deployed web origin (e.g. https://app.dev.intelligent-eu-bp.blooo.dev). E2E does not start a local server.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  // INT-211 — serial IdP logins against one Keycloak realm; avoid parallel session races.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  // INT-256 — never mask flakes with retries; a retry-pass is a hard fail.
  retries: 0,
  reporter: "list",
  timeout: 90_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
