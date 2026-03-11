import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("UAT-028 seed script documents INT-196 bridge path", async () => {
  const src = await readFile("scripts/uat028-seed-billing-trace.mjs", "utf8");
  assert.match(src, /INT-196/);
  assert.match(src, /INT-197/);
  assert.match(src, /UAT-028/);
  assert.match(src, /invoices:from-settlement/);
  assert.match(src, /billing-runs/);
  assert.match(src, /PRODUCER_STRIPE_ACCOUNT_ID/);
  assert.match(src, /producerStripeAccountId/);
  assert.match(src, /c0ffee00-1234-4abc-8def-0123456789ab/);
});
