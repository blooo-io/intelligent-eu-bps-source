import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// INT-184 — continuous verification workflow packaging.
test("e2e-dev workflow targets deployed app.dev after supply-chain", async () => {
  const text = await readFile(
    new URL("../.github/workflows/e2e-dev.yml", import.meta.url),
    "utf8",
  );
  assert.match(text, /name:\s*e2e-dev/);
  assert.match(text, /workflow_run:/);
  assert.match(text, /workflows:\s*\[supply-chain\]/);
  assert.match(text, /environment:\s*dev/);
  assert.match(text, /E2E_BASE_URL:\s*https:\/\/app\.dev\.intelligent-eu-bp\.blooo\.dev/);
  // INT-194 — also roll participants so UAT IdP seed is present for auth e2e.
  assert.match(text, /for d in web participants/);
  assert.match(text, /rollout restart "deploy\/\$\{d\}"/);
  assert.match(text, /E2E_UAT_MEMBER_USER:\s*uat-member/);
  assert.match(text, /test:e2e/);
  assert.equal(text.includes("webServer"), false);
  assert.equal(text.includes("localhost:4173"), false);
});

test("e2e CD doc explains verification after GitOps", async () => {
  const text = await readFile(
    new URL("../docs/testing/ac01-e2e-cd.md", import.meta.url),
    "utf8",
  );
  assert.match(text, /INT-184/);
  assert.match(text, /supply-chain/);
  assert.match(text, /e2e-dev/);
});
