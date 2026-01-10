import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("functional case set lists every in-scope UAT without copying case text (INT-76)", async () => {
  const inventory = await readFile(
    "docs/testing/v1-functional-cases.md",
    "utf8",
  );
  const plan = await readFile("docs/testing/v1-test-plan.md", "utf8");
  assert.match(inventory, /INT-76/);
  assert.match(inventory, /does not copy Given\/When\/Then/);
  assert.match(plan, /v1-functional-cases\.md/);

  const uatDir = "docs/requirements/items/uat";
  const files = (await readdir(uatDir)).filter((f) => /^UAT-\d+\.md$/.test(f));
  const inScope = [];
  for (const file of files) {
    const body = await readFile(path.join(uatDir, file), "utf8");
    if (!/^scope_d55:\s*in\b/m.test(body)) continue;
    const id = file.replace(/\.md$/, "");
    inScope.push(id);
    assert.match(inventory, new RegExp(`\\b${id}\\b`), `missing ${id}`);
    // Must not paste the given line from the note into the inventory.
    const given = body.match(/^given:\s*"(.+)"$/m)?.[1];
    if (given && given.length > 40) {
      assert.equal(inventory.includes(given), false, `copied given from ${id}`);
    }
  }
  assert.ok(inScope.length >= 50, `expected many in-scope UATs, got ${inScope.length}`);
  assert.match(inventory, new RegExp(`Count: \\*\\*${inScope.length}\\*\\*`));
});
