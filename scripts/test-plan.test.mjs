import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the V1 test plan points at the UAT notes and does not copy a case", async () => {
  const plan = await readFile("docs/testing/v1-test-plan.md", "utf8");
  const catalogue = await readFile("docs/requirements/items/uat/UAT-001.md", "utf8");
  const given = catalogue.match(/^given: "(.+)"$/m)?.[1];
  assert.ok(given);
  assert.match(plan, /docs\/requirements\/items\/uat\//);
  assert.match(plan, /does not hold the case text/);
  assert.equal(plan.includes(given), false);
});
