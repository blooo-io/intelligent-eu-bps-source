import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scriptUrl = new URL("./cluster-money-path-e2e.mjs", import.meta.url);

test("INT-461 cluster-money-path-e2e covers S8/S9/S10 Stripe fixtures", async () => {
  const src = await readFile(scriptUrl, "utf8");
  assert.match(src, /INT-461/);
  assert.match(src, /run_path: stripe-test/);
  assert.match(src, /pm_card_visa/);
  assert.match(src, /pm_card_chargeDeclined/);
  assert.match(src, /payment-methods:attach/);
  assert.match(src, /payments:start/);
  assert.match(src, /\/reminders/);
  assert.match(src, /payouts:request/);
  assert.match(src, /tok_bypassPending/);
  assert.match(src, /E2E_FRESH_INVOICE_IDS/);
  assert.match(src, /EVIDENCE_DIR/);
  assert.match(src, /buildInternalServiceHeaders/);
  // INT-465 — S10 tolerates an already-active period payout from prior CI.
  assert.match(src, /INT-465/);
});

test("INT-461 money-path-stripe-dev workflow seeds then drives S8–S10", async () => {
  const text = await readFile(
    new URL("../.github/workflows/money-path-stripe-dev.yml", import.meta.url),
    "utf8",
  );
  assert.match(text, /name:\s*money-path-stripe-dev/);
  assert.match(text, /workflow_run:/);
  assert.match(text, /workflows:\s*\[supply-chain\]/);
  assert.match(text, /environment:\s*dev/);
  assert.match(text, /stripe-fresh-billing-run\.mjs/);
  assert.match(text, /cluster-money-path-e2e\.mjs/);
  assert.match(text, /STRIPE_SECRET_KEY/);
  assert.match(text, /run_path=stripe-test/);
  assert.match(text, /money-path-stripe-evidence/);
  // Do not revive Playwright money-path (INT-455 removed e2e-dev).
  assert.doesNotMatch(text, /playwright/i);
  assert.doesNotMatch(text, /test:e2e/);
});
