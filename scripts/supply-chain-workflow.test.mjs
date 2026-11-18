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

test("INT-411 supply-chain runs after CI success on develop", async () => {
  const text = await readFile(
    new URL("../.github/workflows/supply-chain.yml", import.meta.url),
    "utf8",
  );
  assert.match(text, /workflow_run:/);
  assert.match(text, /workflows:\s*\[["']ci["']\]/);
  assert.match(text, /head_branch == 'develop'/);
  assert.match(text, /conclusion == 'success'/);
  assert.match(text, /head_repository\.full_name == github\.repository/);
  assert.doesNotMatch(text, /ref:\s*\$\{\{\s*steps\.tip\.outputs\.sha/);
  assert.doesNotMatch(text, /on:\s*\n\s*push:\s*\n\s*branches:\s*\[[^\]]*develop/);
});

test("INT-383/INT-402/INT-411 every .trivyignore advisory expires and known entries are listed", async () => {
  const text = await readFile(new URL("../.trivyignore", import.meta.url), "utf8");
  const entries = text.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  for (const line of entries) {
    assert.match(line, /^\S+ exp:\d{4}-\d{2}-\d{2}$/, `missing expiry: ${line}`);
  }
  // INT-383 — glibc UNKNOWN on distroless debian13.
  assert.ok(entries.some((l) => l.startsWith("CVE-2026-100290 ")));
  assert.ok(entries.some((l) => l.startsWith("CVE-2026-115819 ")));
  // INT-402 — libssl3t64 UNKNOWN blocking apps-docs-portal image scan.
  assert.ok(entries.some((l) => l.startsWith("CVE-2026-107493 ")));
  assert.ok(entries.some((l) => l.startsWith("CVE-2026-124709 ")));
  assert.ok(entries.some((l) => l.startsWith("CVE-2026-35190 ")));
  // INT-411 — libc6 charset UNKNOWN blocking image scan.
  assert.ok(entries.some((l) => l.startsWith("CVE-2026-121757 ")));
  assert.ok(entries.some((l) => l.startsWith("CVE-2026-121758 ")));
  assert.ok(entries.some((l) => l.startsWith("CVE-2026-124024 ")));
});

test("INT-381 supply-chain runs are serialized and diff from the last successful run", async () => {
  const text = await readFile(
    new URL("../.github/workflows/supply-chain.yml", import.meta.url),
    "utf8",
  );
  assert.match(
    text,
    /concurrency:\n\s+group:\s*supply-chain-develop\n\s+cancel-in-progress:\s*false/,
  );
  assert.match(text, /actions:\s*read/);
  assert.match(text, /gh run list[\s\S]*--workflow supply-chain\.yml[\s\S]*--status success/);
  assert.match(text, /IMAGE_DIFF_BASE:\s*\$\{\{\s*steps\.diff-base\.outputs\.base\s*\}\}/);
  assert.doesNotMatch(text, /IMAGE_DIFF_BASE:\s*\$\{\{\s*github\.event\.before/);
});

test("INT-411/INT-412 stable-release cuts SemVer tag and dispatches release", async () => {
  const text = await readFile(
    new URL("../.github/workflows/stable-release.yml", import.meta.url),
    "utf8",
  );
  assert.match(text, /name:\s*stable-release/);
  assert.match(text, /workflows:\s*\[["']supply-chain["']\]/);
  assert.match(text, /conclusion == 'success'/);
  assert.match(text, /head_branch == 'develop'/);
  assert.match(text, /head_repository\.full_name == github\.repository/);
  // Privileged workflow_run: never pass head_sha to actions/checkout ref=.
  assert.match(text, /ref:\s*develop/);
  assert.doesNotMatch(text, /ref:\s*\$\{\{\s*github\.event\.workflow_run\.head_sha/);
  assert.match(text, /merge-base --is-ancestor/);
  assert.match(text, /--workflow ci\.yml/);
  assert.match(text, /git tag -a/);
  assert.match(text, /git push origin "refs\/tags\/\$\{TAG\}"/);
  assert.match(text, /package\.json/);
  // INT-412 — GITHUB_TOKEN tag push cannot start release; dispatch instead.
  assert.match(text, /actions:\s*write/);
  assert.match(text, /gh workflow run release\.yml/);
  assert.match(text, /publish_images=true/);
  assert.match(text, /steps\.cut\.outputs\.pushed == 'true'/);
});
