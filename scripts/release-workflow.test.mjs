import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("INT-305 release workflow publishes GitHub Releases from SemVer tags", async () => {
  const text = await readFile(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );
  assert.match(text, /name:\s*release/);
  assert.match(text, /tags:\s*\n\s*-\s*"v\*\.\*\.\*"/);
  assert.match(text, /workflow_dispatch:/);
  assert.match(text, /ARGS=\(release create/);
  assert.match(text, /--generate-notes/);
  assert.match(text, /IMAGE_FLOATING_TAG/);
  assert.match(text, /IMAGE_CHANGED_ONLY:\s*"false"/);
  assert.match(text, /module-images\.mjs/);
  assert.match(text, /package\.json version/);
  assert.match(text, /runs-on:\s*ubuntu-24\.04/);
  assert.equal(text.includes("ubuntu-latest"), false);
});

test("INT-305 VERSIONING.md documents SemVer and cut-release", async () => {
  const text = await readFile(
    new URL("../docs/release/VERSIONING.md", import.meta.url),
    "utf8",
  );
  assert.match(text, /INT-305/);
  assert.match(text, /vMAJOR\.MINOR\.PATCH/);
  assert.match(text, /cut-release\.mjs/);
  assert.match(text, /immutable/i);
  assert.match(text, /IMAGE_FLOATING_TAG|:vX\.Y\.Z|ghcr\.io/);
});
