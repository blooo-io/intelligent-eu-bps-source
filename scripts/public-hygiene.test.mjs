import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { findHygieneViolations, listTrackedTextFiles } from "./public-hygiene.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const id = ["62f0d6c1", "5111209f", "4fdff1dc"].join("");
test("A10.7 flags a Jira account id in a rule file", () => {
  assert.deepEqual(
    findHygieneViolations([{ path: ".cursor/rules/x.mdc", text: `assign to \`${id}\`` }]),
    [{ path: ".cursor/rules/x.mdc", line: 1, rule: "jira-account-id" }],
  );
});

test("A10.7 ignores 32/40-hex trade ids and commit shas", () => {
  assert.deepEqual(
    findHygieneViolations([
      {
        path: "docs/a.md",
        text: "0x8f3a1c2b4d5e6f708192a3b4c5d6e7f8 426819c20bbcf013fda1931b5d69e2089891d3fd",
      },
    ]),
    [],
  );
});

test("A10.7 allows security@ but flags a personal Blooo address", () => {
  const r = findHygieneViolations([
    {
      path: "deploy/v.yaml",
      text: `email: security@blooo.io\nby ${"jane"}@blooo.io`,
    },
  ]);
  assert.deepEqual(
    r.map((v) => [v.line, v.rule]),
    [[2, "personal-blooo-email"]],
  );
});

test("A10.7 flags brain question ids in docs only", () => {
  const q = `Q-${"031"}`;
  assert.equal(
    findHygieneViolations([
      { path: "docs/requirements/items/requirements/REQ-003.md", text: `(${q})` },
    ]).length,
    1,
  );
  assert.equal(findHygieneViolations([{ path: "services/x.ts", text: q }]).length, 0);
});

test("A10.7 HEAD is clean", async () => {
  const paths = await listTrackedTextFiles(root);
  const files = [];
  for (const p of paths) {
    let text;
    try {
      text = await readFile(path.join(root, p), "utf8");
    } catch {
      continue;
    }
    if (text.includes("\0")) continue;
    files.push({ path: p, text });
  }
  assert.deepEqual(findHygieneViolations(files), []);
});