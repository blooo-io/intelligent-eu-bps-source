import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/**
 * In-scope UATs still Not Run after the v6.1 campaign (Task 6.14 / INT-437).
 * Empty when every in-scope note is Pass / Pass on mock path — package must then
 * link the re-run packaging doc instead of listing leftover Blocked ids.
 */
const REMAINING = [];

test("UAT package lists remaining cases without copying note text (INT-79)", async () => {
  const pack = await readFile("docs/testing/v1-uat-package.md", "utf8");
  const plan = await readFile("docs/testing/v1-test-plan.md", "utf8");
  const sample = await readFile(
    "docs/requirements/items/uat/UAT-015.md",
    "utf8",
  );
  assert.match(pack, /INT-79/);
  assert.match(pack, /INT-80/);
  assert.match(pack, /does not|Case text stays|no duplicated/i);
  assert.match(plan, /v1-uat-package\.md/);
  // Task 6.14: campaign packaging lives in v6.1-rerun.md once REMAINING is empty.
  assert.match(pack, /v6\.1-rerun\.md/);
  for (const id of REMAINING) {
    assert.match(pack, new RegExp(`\\b${id}\\b`), `missing ${id}`);
  }
  const given = sample.match(/^given:\s*"(.+)"$/m)?.[1];
  if (given) {
    assert.equal(pack.includes(given), false);
  }
});
