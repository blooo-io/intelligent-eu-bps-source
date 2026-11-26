import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const modules = [
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
  // INT-454 — Mock CGW transport stand-in on destinDev.
  "mock-cgw",
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

  // INT-328 — SMTP NetworkPolicy (Keycloak → 1025); UI not opened to the mesh.
  const np = await readFile(
    "deploy/charts/mailpit/templates/networkpolicy.yaml",
    "utf8",
  );
  assert.match(np, /kind: NetworkPolicy/);
  assert.match(np, /INT-328/);
  assert.match(np, /keycloakNamespace/);
  assert.match(np, /smtpPort/);
  assert.equal(/uiPort/.test(np), false);
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
  // INT-348 — Nest verifies iss against public hostname after INT-345.
  assert.match(
    participants,
    /KEYCLOAK_ISSUER:\s*https:\/\/auth\.intelligent-eu-bp\.blooo\.dev\/realms\/int/,
  );
  assert.equal(/keycloak\.keycloak\.svc\.cluster\.local:8080/.test(participants), false);
  const payments = await readFile("deploy/charts/payments/values.yaml", "utf8");
  assert.match(payments, /stripeEgress: true/);
  // REQ-015 — AC-14 RunAutoPayouts reaches AC-07.
  assert.match(payments, /ingressFrom:[\s\S]*- scheduler-worker/);
  const scheduler = await readFile("deploy/charts/scheduler/values.yaml", "utf8");
  assert.match(scheduler, /egressModules:[\s\S]*- payments/);
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

test("chart labels use the current repository name (INT-372)", async () => {
  const files = await yamlFiles("deploy/charts");
  assert.ok(files.length > 0);
  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.equal(
      text.includes("part-of: intelligent-eu-billing-and-payment"),
      false,
      file,
    );
  }
  const shared = await readFile("deploy/charts/module/templates/_resources.tpl", "utf8");
  assert.match(shared, /part-of: intelligent-eu-bps-source/);
});

test("docs-portal disables ExternalSecret (INT-249)", async () => {
  const values = await readFile("deploy/charts/docs-portal/values.yaml", "utf8");
  assert.match(values, /externalSecret:\s*false/);
});

test("A8-live: every deployed environment runs the EWDS adapters live", async () => {
  // A8 — mock remains for local/tests; cluster envs go live except MARKET on
  // dev (INT-440 — GSY topics externally blocked; S1 bootstrap for e2e).
  const liveAdapters = [
    "DATASPACE_ADAPTER",
    "ACTOR_SOURCE_ADAPTER",
    "ERASURE_SOURCE_ADAPTER",
    "TARIFF_ADAPTER",
  ];
  for (const envName of ["dev", "demo"]) {
    const text = await readFile(`deploy/envs/${envName}/values.yaml`, "utf8");
    for (const key of liveAdapters) {
      assert.match(text, new RegExp(`${key}:\\s*ewds`), `${envName} ${key}`);
    }
    assert.match(text, /COMMAND_CHANNEL_ENABLED:\s*"true"/);
    // INT-439 — publication command poller requires reply encryption when enabled.
    assert.match(text, /EWDS_REPLY_ENCRYPTED:\s*"true"/);
    // INT-440 — erasure + KYC return allow-list required in deployed envs.
    assert.match(text, /ERASURE_ADAPTERS:\s*http/);
    assert.match(text, /KYC_RETURN_URL_ALLOWLIST:/);
  }
  const demo = await readFile("deploy/envs/demo/values.yaml", "utf8");
  assert.match(demo, /MARKET_ADAPTER:\s*ewds/);
  assert.match(demo, /INTAKE_BOOTSTRAP_S1:\s*"false"/);
  const destinDev = await readFile("deploy/envs/dev/values.yaml", "utf8");
  assert.match(destinDev, /MARKET_ADAPTER:\s*mock/);
  assert.match(destinDev, /INTAKE_BOOTSTRAP_S1:\s*"true"/);
  // INT-454 — destinDev points CGW at Mock CGW (adapters stay ewds).
  assert.match(destinDev, /CGW_BASE_URL:\s*http:\/\/mock-cgw:8080/);
  assert.match(destinDev, /EWDS_COMMAND_ALLOWED_DIDS:\s*"did:ethr:volta:0xMockCgwBlooo/);
});

test("INT-454: mock-cgw chart + Argo app + peer egress", async () => {
  const chart = await readFile("deploy/charts/mock-cgw/Chart.yaml", "utf8");
  assert.match(chart, /^name: mock-cgw$/m);
  const values = await readFile("deploy/charts/mock-cgw/values.yaml", "utf8");
  assert.match(values, /replicaCount:\s*1/);
  assert.match(values, /ingressFrom:[\s\S]*- publication/);
  const argo = await readFile("deploy/argocd/dev/mock-cgw.yaml", "utf8");
  assert.match(argo, /name: dev-mock-cgw/);
  assert.match(argo, /path: deploy\/charts\/mock-cgw/);
  for (const name of [
    "publication",
    "participants",
    "trade-intake",
    "compliance",
    "reference-data",
  ]) {
    const text = await readFile(`deploy/charts/${name}/values.yaml`, "utf8");
    assert.match(text, /egressModules:[\s\S]*- mock-cgw/, `${name} egress`);
  }
});

test("INT-440: internal peer URLs present where compliance/participants/settlement/invoicing need them", async () => {
  const compliance = await readFile("deploy/charts/compliance/values.yaml", "utf8");
  assert.match(compliance, /PAYMENTS_INTERNAL_URL:\s*http:\/\/payments:8080/);
  assert.match(compliance, /INVOICING_INTERNAL_URL:\s*http:\/\/invoicing:8080/);
  assert.match(compliance, /egressModules:[\s\S]*- payments/);
  assert.match(compliance, /egressModules:[\s\S]*- invoicing/);

  const participants = await readFile(
    "deploy/charts/participants/values.yaml",
    "utf8",
  );
  assert.match(participants, /PAYMENTS_INTERNAL_URL:\s*http:\/\/payments:8080/);
  assert.match(participants, /SETTLEMENT_INTERNAL_URL:\s*http:\/\/settlement:8080/);

  const settlement = await readFile("deploy/charts/settlement/values.yaml", "utf8");
  assert.match(settlement, /PAYMENTS_INTERNAL_URL:\s*http:\/\/payments:8080/);

  const invoicing = await readFile("deploy/charts/invoicing/values.yaml", "utf8");
  assert.match(invoicing, /PAYMENTS_INTERNAL_URL:\s*http:\/\/payments:8080/);
  assert.match(invoicing, /SETTLEMENT_INTERNAL_URL:\s*http:\/\/settlement:8080/);
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
