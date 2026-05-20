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
});
