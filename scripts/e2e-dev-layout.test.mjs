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
  // INT-211 — manager + operator credentials for full screen/button suite.
  assert.match(text, /E2E_UAT_MANAGER_USER:\s*uat-manager/);
  assert.match(text, /E2E_UAT_OPERATOR_USER:\s*uat-operator/);
  assert.match(text, /test:e2e/);
  // INT-251 — money-path asserts Stripe charges using the cluster payments secret.
  assert.match(text, /STRIPE_SECRET_KEY/);
  assert.match(text, /secret payments/);
  assert.match(text, /stripe-fresh-billing-run\.mjs/);
  assert.equal(text.includes("webServer"), false);
  assert.equal(text.includes("localhost:4173"), false);
});

test("e2e suite includes INT-251 Stripe money-path journey", async () => {
  const text = await readFile(
    new URL("../docs/testing/ac01-e2e.md", import.meta.url),
    "utf8",
  );
  assert.match(text, /INT-251/);
  assert.match(text, /money-path-stripe\.spec\.ts/);
});

test("e2e suite documents INT-211 live screen coverage", async () => {
  const text = await readFile(
    new URL("../docs/testing/ac01-e2e.md", import.meta.url),
    "utf8",
  );
  assert.match(text, /INT-211/);
  assert.match(text, /nav-shell\.spec\.ts/);
  assert.match(text, /member-screens\.spec\.ts/);
  assert.match(text, /manager-screens\.spec\.ts/);
  assert.match(text, /operator-screens\.spec\.ts/);
});

test("e2e suite documents INT-218 REQ-mapped journeys", async () => {
  const text = await readFile(
    new URL("../docs/testing/ac01-e2e.md", import.meta.url),
    "utf8",
  );
  assert.match(text, /INT-218/);
  assert.match(text, /onboarding-happy-path\.spec\.ts/);
  assert.match(text, /invoices-pdf-pay\.spec\.ts/);
  assert.match(text, /balances-settle\.spec\.ts/);
  assert.match(text, /manager-billing-run\.spec\.ts/);
  assert.match(text, /participant-import\.spec\.ts/);
  assert.match(text, /payment-setup\.spec\.ts/);
  assert.match(text, /operator-payment-trace\.spec\.ts/);
  assert.match(text, /REQ-009/);
  assert.match(text, /REQ-008/);
  assert.match(text, /REQ-028/);
  assert.match(text, /REQ-057/);
  assert.match(text, /no soft-accept/);
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
