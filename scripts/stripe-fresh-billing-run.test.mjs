import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("stripe-fresh-billing-run.mjs (INT-228 / INT-238)", () => {
  const src = readFileSync(
    new URL("./stripe-fresh-billing-run.mjs", import.meta.url),
    "utf8",
  );

  it("provisions fresh Connect accounts and resets fixture billed", () => {
    assert.match(src, /payment-accounts:provision/);
    assert.match(src, /fresh:\s*true/);
    assert.match(src, /fixture-billed:reset/);
    assert.match(src, /billing-runs/);
    assert.match(src, /acct_test_/);
  });

  it("polls invoices via by-settlement without HTTP bridge (INT-238)", () => {
    assert.match(src, /invoices:by-settlement/);
    assert.match(src, /INVOICING_URL/);
    // Must not POST the operator bridge (comments may mention it).
    assert.doesNotMatch(src, /method:\s*"POST"[\s\S]*from-settlement|from-settlement[\s\S]*method:\s*"POST"/);
    assert.doesNotMatch(src, /\/internal\/v1\/invoices:from-settlement/);
    assert.match(src, /NATS SettlementCompleted/);
  });

  it("waits for charges_enabled before startRun (INT-240)", () => {
    assert.match(src, /waitForChargesEnabled/);
    assert.match(src, /charges_enabled never became true/);
    assert.match(src, /payment-accounts\/\$\{participantId\}/);
  });

  it("exports the invoice ids it created for the money-path journey (INT-368)", () => {
    assert.match(src, /exportFreshInvoiceIds\(invoices\.map\(\(i\) => i\.invoiceId\)\)/);
    assert.match(src, /process\.env\.GITHUB_ENV/);
    assert.match(src, /E2E_FRESH_INVOICE_IDS=\$\{invoiceIds\.join\(","\)\}/);
  });

  it("mints service JWT for /internal when Keycloak is configured (INT-317)", () => {
    assert.match(src, /buildInternalServiceHeaders/);
    assert.match(src, /initServiceHeaders/);
    assert.match(src, /KEYCLOAK_BASE_URL/);
    assert.match(src, /SERVICE_JWT_REQUIRED/);
  });

  it("refreshes AC-04 intake before StartRun (INT-440 e2e seed)", () => {
    assert.match(src, /TRADE_INTAKE_URL/);
    assert.match(src, /intake:refresh/);
    assert.match(src, /intakeRefresh/);
    assert.match(src, /2026-11-01T00:00:00Z/);
  });

  it("provisions payer and manager KYC fixtures for e2e (INT-440 / REQ-045)", () => {
    assert.match(src, /KYC_FIXTURES/);
    assert.match(src, /provisionKycFixtures/);
    assert.match(src, /uat-manager-sofia/);
    assert.match(src, /s1-consumer-lea/);
    assert.match(src, /uat-member-hugo/);
  });
});
