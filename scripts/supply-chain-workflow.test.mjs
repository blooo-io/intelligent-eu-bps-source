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

test("INT-383 every .trivyignore advisory expires and the glibc entries are listed", async () => {
  const text = await readFile(new URL("../.trivyignore", import.meta.url), "utf8");
  const entries = text.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  for (const line of entries) {
    assert.match(line, /^\S+ exp:\d{4}-\d{2}-\d{2}$/, `missing expiry: ${line}`);
  }
  assert.ok(entries.some((l) => l.startsWith("CVE-2026-100290 ")));
  assert.ok(entries.some((l) => l.startsWith("CVE-2026-115819 ")));
});

test("INT-381 supply-chain runs are serialized and diff from the last successful run", async () => {
  const text = await readFile(
    new URL("../.github/workflows/supply-chain.yml", import.meta.url),
    "utf8",
  );
  assert.match(text, /concurrency:\n\s+group:\s*supply-chain-\$\{\{\s*github\.ref\s*\}\}\n\s+cancel-in-progress:\s*false/);
  assert.match(text, /actions:\s*read/);
  assert.match(text, /gh run list[\s\S]*--workflow supply-chain\.yml[\s\S]*--status success/);
  assert.match(text, /IMAGE_DIFF_BASE:\s*\$\{\{\s*steps\.diff-base\.outputs\.base\s*\}\}/);
  assert.doesNotMatch(text, /IMAGE_DIFF_BASE:\s*\$\{\{\s*github\.event\.before/);
});
