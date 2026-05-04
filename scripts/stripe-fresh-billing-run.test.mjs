import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("stripe-fresh-billing-run.mjs (INT-228)", () => {
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
});
