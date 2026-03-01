import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * INT-187 — authenticated screens must live inside AppShell/PageFrame.
 * Guard against reintroducing the full-viewport header + "Back to home" hack.
 */
describe("shell page regression (INT-187)", () => {
  const pagesDir = join(__dirname, "../pages");
  const protectedPages = readdirSync(pagesDir).filter(
    (f) =>
      f.endsWith("-page.tsx") &&
      !["login-page.tsx", "callback-page.tsx"].includes(f),
  );

  it("lists the expected protected pages", () => {
    expect(protectedPages.sort()).toEqual(
      [
        "balances-page.tsx",
        "billing-runs-page.tsx",
        "community-settings-page.tsx",
        "home-page.tsx",
        "invoices-page.tsx",
        "onboarding-wizard-page.tsx",
        "operator-page.tsx",
        "participants-page.tsx",
        "payment-setup-page.tsx",
        "payments-overview-page.tsx",
        "privacy-page.tsx",
        "profile-page.tsx",
        "reports-page.tsx",
        "terms-page.tsx",
      ].sort(),
    );
  });

  for (const file of protectedPages) {
    it(`${file} uses PageFrame and has no Back-to-home / full-viewport main`, () => {
      const src = readFileSync(join(pagesDir, file), "utf8");
      expect(src).toMatch(/PageFrame/);
      expect(src).not.toMatch(/Back to home/);
      expect(src).not.toMatch(/minHeight:\s*"100vh"/);
    });
  }
});
