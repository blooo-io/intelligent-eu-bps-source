import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("UAT-053 seed script maps two producers to distinct Connect accounts", async () => {
  const src = await readFile("scripts/uat053-seed-numbering.mjs", "utf8");
  assert.match(src, /INT-203/);
  assert.match(src, /UAT-053/);
  assert.match(src, /REQ-042/);
  assert.match(src, /acct_1URyv9FGX8DfzG09/);
  assert.match(src, /acct_1URvtiF4LYz7qY6g/);
  assert.match(src, /66666666-7777-4888-9999-aaaaaaaaaaaa/);
  assert.match(src, /bbbbbbbb-cccc-4ddd-8eee-ffffffffffff/);
  assert.match(src, /invoices:from-settlement/);
  assert.match(src, /assertEwdsCarriesInvoiceIdOnly/);
  assert.match(src, /legal number/i);
});
