import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/** WS2 invoice spec-trace UATs that the V1 test plan must name (INT-428 / Task 2.19). */
const WS2_SPEC_TRACE = [
  "UAT-003",
  "UAT-004",
  "UAT-007",
  "UAT-050",
  "UAT-053",
  "UAT-078",
];

test("the V1 test plan points at the UAT notes and does not copy a case", async () => {
  const plan = await readFile("docs/testing/v1-test-plan.md", "utf8");
  const catalogue = await readFile("docs/requirements/items/uat/UAT-001.md", "utf8");
  const given = catalogue.match(/^given: "(.+)"$/m)?.[1];
  assert.ok(given);
  assert.match(plan, /docs\/requirements\/items\/uat\//);
  assert.match(plan, /does not hold the case text/);
  assert.equal(plan.includes(given), false);
});

test("WS2 spec trace lists UAT-078 and related invoice UATs in the V1 test plan (INT-428)", async () => {
  const plan = await readFile("docs/testing/v1-test-plan.md", "utf8");
  for (const id of WS2_SPEC_TRACE) {
    assert.match(plan, new RegExp(`\\b${id}\\b`), `test plan missing ${id}`);
  }
});
