import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("INT-321 supply-chain can force a full image republish via workflow_dispatch", async () => {
  const text = await readFile(
    new URL("../.github/workflows/supply-chain.yml", import.meta.url),
    "utf8",
  );
  assert.match(text, /name:\s*supply-chain/);
  assert.match(text, /workflow_dispatch:/);
  assert.match(text, /force_all_images:/);
  // Full rebuild when dispatch sets force_all_images (IMAGE_CHANGED_ONLY false).
  assert.match(
    text,
    /IMAGE_CHANGED_ONLY:\s*\$\{\{\s*github\.event_name == 'workflow_dispatch' && inputs\.force_all_images && 'false' \|\| 'true'\s*\}\}/,
  );
  assert.match(text, /module-images\.mjs --build/);
  assert.match(text, /IMAGE_FLOATING_TAG:\s*develop/);
});
