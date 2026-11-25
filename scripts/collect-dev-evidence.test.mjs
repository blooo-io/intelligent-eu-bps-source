import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("INT-438 evidence matrix and collector exist", async () => {
  const matrix = await readFile("docs/testing/v6.1-evidence-matrix.md", "utf8");
  const collector = await readFile("scripts/collect-dev-evidence.mjs", "utf8");
  assert.match(matrix, /no simulations/i);
  assert.match(matrix, /run_path: stripe-test/);
  assert.match(matrix, /live-cg/);
  assert.match(matrix, /R1/);
  assert.match(collector, /probe\.json/);
  assert.match(collector, /CrashLoopBackOff/);
  assert.match(collector, /externalsecret/);
  // Must never print secret values.
  assert.equal(collector.includes("console.log(stripeKey)"), false);
  assert.equal(collector.includes("console.log(cgwKey)"), false);
});
