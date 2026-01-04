import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SCENARIOS = [
  "S1",
  "S2",
  "S3",
  "S4",
  "S5",
  "S6",
  "S7",
  "S8",
  "S9",
  "S10",
  "S11",
  "S12",
  "S13",
];

const UATS = [
  "UAT-071",
  "UAT-072",
  "UAT-073",
  "UAT-075",
  "UAT-052",
  "UAT-001",
  "UAT-002",
  "UAT-074",
  "UAT-016",
  "UAT-057",
  "UAT-056",
  "UAT-013",
  "UAT-070",
];

test("integration prep lists every S1–S13 scenario with UAT links (INT-74)", async () => {
  const prep = await readFile(
    "docs/testing/v1-integration-scenarios.md",
    "utf8",
  );
  const plan = await readFile("docs/testing/v1-test-plan.md", "utf8");
  const registry = await readFile("mocks/src/scenarios/registry.ts", "utf8");

  assert.match(prep, /INT-74/);
  assert.match(prep, /INT-75/);
  assert.match(prep, /03-application-architecture\.md/);
  assert.match(prep, /createMockSuite/);
  assert.match(prep, /Stripe test/);
  assert.match(plan, /v1-integration-scenarios\.md/);

  for (const id of SCENARIOS) {
    assert.match(prep, new RegExp(`\\b${id}\\b`), `prep missing ${id}`);
    assert.match(registry, new RegExp(`${id}:`), `registry missing ${id}`);
  }
  for (const uat of UATS) {
    assert.match(prep, new RegExp(`\\b${uat}\\b`), `prep missing ${uat}`);
  }
});
