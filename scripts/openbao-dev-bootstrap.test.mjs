import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  checkOpenbaoDevBootstrapLayout,
  printOpenbaoDevBootstrapSteps,
} from "./openbao-dev-bootstrap.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("openbao V1 bootstrap layout documents single-share init (INT-133)", async () => {
  const summary = await checkOpenbaoDevBootstrapLayout(root);
  assert.equal(summary.keyShares, 1);
  assert.equal(summary.keyThreshold, 1);
  assert.equal(summary.bootstrapSecret, "openbao-dev-bootstrap");
});

test("printed openbao steps never embed key material", () => {
  const text = printOpenbaoDevBootstrapSteps();
  assert.match(text, /key-shares=1/);
  assert.match(text, /key-threshold=1/);
  assert.match(text, /openbao-eso-token/);
  assert.equal(/hvs\.[A-Za-z0-9]+/.test(text), false);
  assert.equal(text.includes("root_token="), false);
});

test("openbao values comment points at V1 single-share bootstrap", async () => {
  const text = await readFile(
    path.join(root, "deploy/platform/openbao/values.yaml"),
    "utf8",
  );
  assert.match(text, /key-shares=1|openbao-dev-bootstrap/);
  assert.equal(text.includes("stringData:"), false);
});
