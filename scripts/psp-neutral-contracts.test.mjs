/**
 * INT-423 WS5 Task 5.1 — PSP-neutral contract property names and TE-2 / ER1.4 fields (REQ-046).
 * Pure string asserts: runs before pnpm install in scripts/run-tests.mjs.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("REQ-046 contracts are PSP-neutral and expose TE-2/ER1.4 fields [INT-423]", async () => {
  for (const f of [
    "contracts/openapi/public.v1.yaml",
    "contracts/openapi/internal/payments.v1.yaml",
    "contracts/asyncapi/payments.v1.yaml",
  ]) {
    const text = await readFile(f, "utf8");
    // Property keys only (avoid matching prose that mentions Stripe).
    assert.doesNotMatch(text, /^\s+stripe[A-Za-z0-9]*:/m, f);
    assert.doesNotMatch(text, /^\s+Stripe[A-Za-z0-9]*:/m, f);
  }

  const pub = await readFile("contracts/openapi/public.v1.yaml", "utf8");
  assert.match(
    pub,
    /\/reports\/payment-methods:[\s\S]*?operationId:\s*getPaymentMethodReport/,
  );
  for (const field of [
    "averageFee",
    "count",
    "failedCount",
    "feeCurrency",
    "feeMissingCount",
    "medianProcessingTimeMs",
    "method",
    "pendingCount",
    "succeededCount",
    "successRate",
    "totalFee",
  ]) {
    assert.match(pub, new RegExp(`PaymentMethodStats:[\\s\\S]*?${field}:`), field);
  }

  const evt = await readFile("contracts/asyncapi/payments.v1.yaml", "utf8");
  assert.match(evt, /PaymentStatusChanged:[\s\S]*?initiatedAt:/);
  assert.match(evt, /PaymentStatusChanged:[\s\S]*?settledAt:/);
  assert.match(evt, /PaymentStatusChanged:[\s\S]*?feeAmount:/);
  assert.match(evt, /PaymentStatusChanged:[\s\S]*?feeCurrency:/);
  assert.match(evt, /method:[\s\S]*?enum:\s*\[card,\s*sepa_debit\]/);
});

test.todo("WS5 Task 5.6: payments domain sources have no stripe-prefixed identifiers", () => {
  // Domain TypeScript neutrality is enforced in Task 5.6 (psp.port split).
});
