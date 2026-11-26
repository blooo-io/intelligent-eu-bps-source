/**
 * INT-423 — billing-owned invoice contracts (REQ-039, REQ-042, REQ-004, REQ-007).
 * Pure string asserts: runs before pnpm install in scripts/run-tests.mjs.
 * INT-455 — public OpenAPI withdrawn; shared + internal contracts only.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("REQ-039/REQ-042 invoicing contracts carry no Stripe invoice fields", async () => {
  const text = await readFile("contracts/openapi/internal/invoicing.v1.yaml", "utf8");
  assert.equal(/stripeInvoiceId|hostedInvoiceUrl|producerStripeAccountId/.test(text), false);
});

test("REQ-004/REQ-007 InvoiceAmounts requires the amount split", async () => {
  const comp = await readFile("contracts/openapi/components/schemas.yaml", "utf8");
  assert.match(
    comp,
    /InvoiceAmounts:[\s\S]*?required:\s*\[energy,\s*gridFee,\s*levy,\s*tax,\s*vat,\s*total\]/,
  );
  const inv = await readFile("contracts/openapi/internal/invoicing.v1.yaml", "utf8");
  assert.match(inv, /\/invoices:send-reminders:[\s\S]*?post:/);
});