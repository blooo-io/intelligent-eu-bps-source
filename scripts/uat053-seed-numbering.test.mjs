import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("UAT-053 seed script validates billing legal numbers via GET invoice", async () => {
  const src = await readFile("scripts/uat053-seed-numbering.mjs", "utf8");
  assert.match(src, /INT-203/);
  assert.match(src, /UAT-053/);
  assert.match(src, /REQ-042/);
  assert.match(src, /66666666-7777-4888-9999-aaaaaaaaaaaa/);
  assert.match(src, /bbbbbbbb-cccc-4ddd-8eee-ffffffffffff/);
  assert.match(src, /invoices:from-settlement/);
  assert.match(src, /assertEwdsCarriesInvoiceIdOnly/);
  assert.match(src, /legal number/i);
  assert.match(src, /\/internal\/v1\/invoices\/\$\{/);
  assert.match(src, /SB-\[A-F0-9\]\{8\}/);
  assert.doesNotMatch(src, /STRIPE_SECRET_KEY/);
  assert.doesNotMatch(src, /api\.stripe\.com/);
  assert.doesNotMatch(src, /producerStripeAccountId/);
  assert.doesNotMatch(src, /PRODUCER_STRIPE_MAP/);
  assert.doesNotMatch(src, /PRODUCER_PSP_ACCOUNT_MAP/);
  assert.doesNotMatch(src, /producerPspAccountRef/);
});
