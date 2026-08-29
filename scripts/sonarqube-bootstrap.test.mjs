/**
 * INT-293 — SonarQube bootstrap packaging + pure helpers (no live cluster).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  PROJECT_KEY,
  TOKEN_NAME,
  buildGithubSyncCommands,
  checkBootstrapLayout,
  generateAdminPassword,
  parseBaoKvData,
  printBootstrapSteps,
} from "./sonarqube-bootstrap.mjs";

test("parseBaoKvData reads kv v2 data map", () => {
  const data = parseBaoKvData(
    JSON.stringify({ data: { data: { admin_password: "x", seeded: "true" } } }),
  );
  assert.equal(data.admin_password, "x");
  assert.equal(data.seeded, "true");
});

test("generateAdminPassword is strong and unique", () => {
  const a = generateAdminPassword();
  const b = generateAdminPassword();
  assert.match(a, /^Sq-/);
  assert.ok(a.length >= 20);
  assert.notEqual(a, b);
});

test("buildGithubSyncCommands never embeds a raw token literal", () => {
  const text = buildGithubSyncCommands();
  assert.match(text, /gh variable set SONAR_HOST_URL/);
  assert.match(text, /gh secret set SONAR_TOKEN/);
  assert.match(text, /sonar\.intelligent-eu-bp\.blooo\.dev/);
  assert.equal(/squ_/.test(text), false);
  assert.equal(/password=/.test(text), false);
});

test("bootstrap layout is documented (INT-293)", async () => {
  const summary = await checkBootstrapLayout();
  assert.equal(summary.ok, true);
  const printed = printBootstrapSteps();
  assert.match(printed, /sonarqube-bootstrap\.mjs --apply/);
  assert.match(printed, /INT-157/);
  assert.match(printed, /SONAR_TOKEN/);
  assert.equal(PROJECT_KEY.startsWith("blooo-io_"), true);
});

test("platform packaging references bootstrap and admin ExternalSecret", async () => {
  const readme = await readFile("deploy/platform/README.md", "utf8");
  assert.match(readme, /sonarqube-bootstrap\.mjs/);
  assert.match(readme, /INT-293/);

  const app = await readFile(
    "deploy/argocd/platform/sonarqube-admin-secret.yaml",
    "utf8",
  );
  assert.match(app, /path: deploy\/charts\/sonarqube-admin-secret/);
  assert.match(app, /namespace: sonarqube/);

  const es = await readFile(
    "deploy/charts/sonarqube-admin-secret/templates/externalsecret.yaml",
    "utf8",
  );
  assert.match(es, /kind: ExternalSecret/);
  assert.match(es, /openbaoProperty/);
  assert.equal(/^\s*kind:\s*Secret\s*$/m.test(es), false);
  const adminValues = await readFile(
    "deploy/charts/sonarqube-admin-secret/values.yaml",
    "utf8",
  );
  assert.match(adminValues, /admin_password/);

  const seed = await readFile("scripts/openbao-seed-dev-placeholders.mjs", "utf8");
  assert.match(seed, /admin_password=dev-only-replace-me/);

  const release = await readFile("docs/release/sonarqube.md", "utf8");
  assert.match(release, /sonarqube-bootstrap\.mjs/);
  assert.match(release, new RegExp(TOKEN_NAME));
});
