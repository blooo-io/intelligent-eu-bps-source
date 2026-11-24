/**
 * INT-423 — billing-owned invoice contracts (REQ-039, REQ-042, REQ-004, REQ-007).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";

test("REQ-039/REQ-042 invoicing contracts carry no Stripe invoice fields", async () => {
  const text = await readFile("contracts/openapi/internal/invoicing.v1.yaml", "utf8");
  assert.equal(/stripeInvoiceId|hostedInvoiceUrl|producerStripeAccountId/.test(text), false);
});

test("REQ-004/REQ-007 InvoiceAmounts requires the amount split", async () => {
  const doc = parseYaml(await readFile("contracts/openapi/public.v1.yaml", "utf8"));
  assert.deepEqual(doc.components.schemas.InvoiceAmounts.required, [
    "energy",
    "gridFee",
    "levy",
    "tax",
    "vat",
    "total",
  ]);
  assert.ok(doc.paths["/invoices/{id}/reminders"].post);
});