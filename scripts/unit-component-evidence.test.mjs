import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const REQUIRED_MODULES = [
  "apps/web",
  "mocks",
  "packages/module-template",
  "services/cd-smoke",
  "services/compliance",
  "services/invoicing",
  "services/notification",
  "services/participants",
  "services/payments",
  "services/publication",
  "services/reconciliation",
  "services/reference-data",
  "services/reporting",
  "services/scheduler",
  "services/settlement",
  "services/trade-intake",
];

test("unit/component evidence lists every executable workspace above 80%", async () => {
  const evidence = await readFile(
    "docs/testing/v1-unit-component-evidence.md",
    "utf8",
  );
  const thresholds = JSON.parse(
    await readFile("config/coverage-thresholds.json", "utf8"),
  );

  assert.equal(thresholds.statements, 80);
  assert.equal(thresholds.branches, 80);
  assert.equal(thresholds.functions, 80);
  assert.equal(thresholds.lines, 80);
  assert.match(evidence, /INT-73/);
  assert.match(evidence, /actions\/runs\/\d+/);
  assert.match(evidence, /coverage/);

  for (const mod of REQUIRED_MODULES) {
    assert.match(
      evidence,
      new RegExp(`\`${mod.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\``),
      `missing module ${mod}`,
    );
  }

  assert.match(evidence, /All sixteen executable workspaces meet the 80%/);
});
