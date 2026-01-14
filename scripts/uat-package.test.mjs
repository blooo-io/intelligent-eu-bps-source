import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const REMAINING = [
  "UAT-015",
  "UAT-028",
  "UAT-036",
  "UAT-040",
  "UAT-044",
  "UAT-045",
  "UAT-046",
  "UAT-047",
  "UAT-049",
  "UAT-050",
  "UAT-051",
  "UAT-053",
  "UAT-061",
  "UAT-064",
  "UAT-067",
  "UAT-068",
];

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
  for (const id of REMAINING) {
    assert.match(pack, new RegExp(`\\b${id}\\b`), `missing ${id}`);
  }
  const given = sample.match(/^given:\s*"(.+)"$/m)?.[1];
  if (given) {
    assert.equal(pack.includes(given), false);
  }
});
