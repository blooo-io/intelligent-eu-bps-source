/**
 * INT-101 — EWDS example payloads must validate against draft topic schemas.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { validateEwdsSchemas } from "./validate-ewds-schemas.mjs";

test("billingInvoice and billingPayment examples validate (INT-101)", async () => {
  const results = await validateEwdsSchemas();
  assert.equal(results.length, 2);
  for (const r of results) {
    assert.equal(r.ok, true, `${r.name}: ${r.errors.join("; ")}`);
  }
});
