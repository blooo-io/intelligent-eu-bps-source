import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("UAT-042 / NFR-010 — every in-scope REQ/NFR has a linked UAT with status", async () => {
  const uatDir = "docs/requirements/items/uat";
  const reqDir = "docs/requirements/items/requirements";
  const covered = new Set();
  for (const file of await readdir(uatDir)) {
    if (!/^UAT-\d+\.md$/.test(file)) continue;
    const body = await readFile(path.join(uatDir, file), "utf8");
    if (!/^scope_d55:\s*in\b/m.test(body)) continue;
    const status = body.match(/^status:\s*"?([^"\n]+)"?/m)?.[1]?.trim();
    assert.ok(status, `${file} missing status`);
    const req = body.match(/^requirement:\s*"\[\[([^\]]+)\]\]"/m)?.[1];
    if (req) covered.add(req);
  }

  const missing = [];
  for (const file of await readdir(reqDir)) {
    if (!/\.md$/.test(file)) continue;
    const body = await readFile(path.join(reqDir, file), "utf8");
    if (/^scope_d55:\s*out\b/m.test(body)) continue;
    const id = body.match(/^id:\s*(\S+)/m)?.[1];
    if (!id) continue;
    if (!covered.has(id)) missing.push(id);
  }
  assert.deepEqual(missing, [], `REQ/NFR without in-scope UAT: ${missing.join(", ")}`);
});
