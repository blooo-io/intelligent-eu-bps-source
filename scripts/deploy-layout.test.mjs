import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const modules = [
  "web",
  "participants",
  "trade-intake",
  "settlement",
  "invoicing",
  "payments",
  "reconciliation",
  "reporting",
  "publication",
  "notification",
  "compliance",
  "reference-data",
  "scheduler",
  "mocks",
  // INT-156 factory CD smoke (proves GHCR image path before product modules).
  "cd-smoke",
];

test("each module has its own chart", async () => {
  for (const name of modules) {
    const chart = await readFile(`deploy/charts/${name}/Chart.yaml`, "utf8");
    assert.match(chart, new RegExp(`^name: ${name}$`, "m"));
    assert.match(chart, /repository: "file:\/\/\.\.\/module"/);
  }
});

test("helmfile releases every module into the environment namespace", async () => {
  const text = await readFile("deploy/helmfile/helmfile.yaml", "utf8");
  for (const name of modules) {
    assert.match(text, new RegExp(`- name: ${name}\\n`));
  }
  assert.match(text, /namespace: "\{\{ \.Values\.appsNamespace \}\}"/);
  assert.match(text, /local:/);
  assert.match(text, /- name: mailpit\n/);
});

test("mailpit chart is non-root and has no committed secret (TD-12)", async () => {
  const chart = await readFile("deploy/charts/mailpit/Chart.yaml", "utf8");
  assert.match(chart, /^name: mailpit$/m);
  const template = await readFile(
    "deploy/charts/mailpit/templates/resources.yaml",
    "utf8",
  );
  assert.match(template, /runAsNonRoot: true/);
  assert.match(template, /readOnlyRootFilesystem: true/);
  assert.equal(/^\s*kind:\s*Secret\s*$/m.test(template), false);
});

test("dev applications track develop and land in int-apps", async () => {
  const dev = await readFile("deploy/envs/dev/values.yaml", "utf8");
  assert.match(dev, /appsNamespace: int-apps/);
  for (const name of modules) {
    const text = await readFile(`deploy/argocd/dev/${name}.yaml`, "utf8");
    assert.match(text, /targetRevision: develop/);
    assert.match(text, /namespace: int-apps/);
    assert.match(text, /automated:/);
    // INT-319 — Applications must clone the renamed GitHub repo, not the old slug.
    assert.match(text, /repoURL:\s*https:\/\/github\.com\/blooo-io\/intelligent-eu-bps-source\.git/);
  }
});

test("demo applications stay manual and land in demo-apps", async () => {
  const demo = await readFile("deploy/envs/demo/values.yaml", "utf8");
  assert.match(demo, /appsNamespace: demo-apps/);
  for (const name of modules) {
    const text = await readFile(`deploy/argocd/demo/${name}.yaml`, "utf8");
    assert.equal(text.includes("automated:"), false);
    assert.equal(text.includes("targetRevision: develop"), false);
    assert.match(text, /namespace: demo-apps/);
  }
});

test("synchronous module calls match the application view", async () => {
  const settlement = await readFile("deploy/charts/settlement/values.yaml", "utf8");
  assert.match(settlement, /egressModules:[\s\S]*- reference-data/);
  const participants = await readFile("deploy/charts/participants/values.yaml", "utf8");
  assert.match(participants, /keycloakEgress: true/);
  // INT-218 — Admin IdP must reach Keycloakx HTTP Service DNS (port 80).
  assert.match(
    participants,
    /KEYCLOAK_BASE_URL:\s*http:\/\/platform-keycloak-keycloakx-http\.keycloak\.svc\.cluster\.local/,
  );
  assert.equal(/keycloak\.keycloak\.svc\.cluster\.local:8080/.test(participants), false);
  const payments = await readFile("deploy/charts/payments/values.yaml", "utf8");
  assert.match(payments, /stripeEgress: true/);
});

test("module NetworkPolicy allows Keycloak HTTP port 80 (INT-218)", async () => {
  const template = await readFile("deploy/charts/module/templates/_resources.tpl", "utf8");
  assert.match(template, /keycloakEgress[\s\S]*port: 80/);
});

test("module NetworkPolicy has no open namespace ingress (INT-287)", async () => {
  const template = await readFile("deploy/charts/module/templates/_resources.tpl", "utf8");
  assert.equal(/namespaceIngress/.test(template), false);
  const settlement = await readFile("deploy/charts/settlement/values.yaml", "utf8");
  assert.match(settlement, /ingressFrom:[\s\S]*scheduler-worker/);
});

test("workloads are non-root with a read-only filesystem and no committed secret", async () => {
  const template = await readFile("deploy/charts/module/templates/_resources.tpl", "utf8");
  assert.match(template, /runAsNonRoot: true/);
  assert.match(template, /readOnlyRootFilesystem: true/);
  assert.match(template, /kind: ExternalSecret/);
  // INT-249 — ExternalSecret can be skipped per chart (docs-portal).
  assert.match(template, /ne \.Values\.externalSecret false/);
  for (const file of await yamlFiles("deploy")) {
    const text = await readFile(file, "utf8");
    assert.equal(/^\s*kind:\s*Secret\s*$/m.test(text), false, file);
    assert.equal(text.includes("stringData:"), false, file);
  }
});

test("docs-portal disables ExternalSecret (INT-249)", async () => {
  const values = await readFile("deploy/charts/docs-portal/values.yaml", "utf8");
  assert.match(values, /externalSecret:\s*false/);
});

async function yamlFiles(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await yamlFiles(fullPath)));
      continue;
    }
    if (entry.name.endsWith(".yaml") || entry.name.endsWith(".tpl")) found.push(fullPath);
  }
  return found;
}
