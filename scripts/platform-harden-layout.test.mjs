/**
 * INT-286 / INT-287 / INT-288 / INT-289 / INT-312 / INT-313 — security hardening packaging.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("INT-287 — module NetworkPolicy has no open namespaceIngress", async () => {
  const template = await readFile(
    "deploy/charts/module/templates/_resources.tpl",
    "utf8",
  );
  assert.equal(/namespaceIngress/.test(template), false);
  assert.equal(/podSelector:\s*\{\s*\}/.test(template), false);
  assert.match(template, /ingressFrom/);

  const participants = await readFile(
    "deploy/charts/participants/values.yaml",
    "utf8",
  );
  assert.match(participants, /ingressFrom:[\s\S]*- notification/);
  assert.equal(/namespaceIngress:\s*true/.test(participants), false);

  const settlement = await readFile(
    "deploy/charts/settlement/values.yaml",
    "utf8",
  );
  assert.match(settlement, /scheduler-worker/);
});

test("INT-287 / INT-314 / INT-325 — Nest modules configure Keycloak service JWT (required)", async () => {
  for (const name of [
    "participants",
    "settlement",
    "invoicing",
    "payments",
    "scheduler",
    "trade-intake",
    "notification",
    "reference-data",
  ]) {
    const values = await readFile(`deploy/charts/${name}/values.yaml`, "utf8");
    assert.match(values, /keycloakEgress:\s*true/, name);
    assert.match(values, /KEYCLOAK_SERVICE_CLIENT_ID:\s*module-service/, name);
    // INT-325 — client secret comes from OpenBao ExternalSecret envFrom only.
    assert.equal(
      /KEYCLOAK_SERVICE_CLIENT_SECRET\s*:/.test(values),
      false,
      name,
    );
    assert.match(
      values,
      /KEYCLOAK_BASE_URL:\s*http:\/\/platform-keycloak-keycloakx-http\.keycloak\.svc\.cluster\.local/,
      name,
    );
    assert.match(values, /SERVICE_JWT_REQUIRED:\s*"true"/, name);
  }

  const participants = await readFile(
    "deploy/charts/participants/values.yaml",
    "utf8",
  );
  assert.equal(
    /KEYCLOAK_ADMIN_CLIENT_SECRET\s*:/.test(participants),
    false,
    "participants admin secret must not be in Helm values",
  );

  const worker = await readFile(
    "deploy/charts/scheduler/templates/worker.yaml",
    "utf8",
  );
  assert.match(worker, /keycloakEgress[\s\S]*port: 80/);
});

test("INT-288 — platform NetworkPolicies chart + Argo app", async () => {
  const chart = await readFile(
    "deploy/charts/platform-network-policies/Chart.yaml",
    "utf8",
  );
  assert.match(chart, /^name: platform-network-policies$/m);

  for (const file of ["keycloak.yaml", "openbao.yaml", "apisix.yaml"]) {
    const text = await readFile(
      `deploy/charts/platform-network-policies/templates/${file}`,
      "utf8",
    );
    assert.match(text, /kind: NetworkPolicy/);
  }

  const app = await readFile(
    "deploy/argocd/platform/platform-network-policies.yaml",
    "utf8",
  );
  assert.match(app, /name: platform-network-policies/);
  assert.match(app, /targetRevision: develop/);
});

test("INT-313 — Temporal, SonarQube, observability NetworkPolicies", async () => {
  for (const file of ["temporal.yaml", "sonarqube.yaml", "observability.yaml"]) {
    const text = await readFile(
      `deploy/charts/platform-network-policies/templates/${file}`,
      "utf8",
    );
    assert.match(text, /kind: NetworkPolicy/);
    assert.match(text, /INT-313/);
  }
  const values = await readFile(
    "deploy/charts/platform-network-policies/values.yaml",
    "utf8",
  );
  assert.match(values, /temporalNamespace:\s*temporal/);
  assert.match(values, /sonarqubeNamespace:\s*sonarqube/);
  assert.match(values, /observabilityNamespace:\s*observability/);
  const sonar = await readFile(
    "deploy/charts/platform-network-policies/templates/sonarqube.yaml",
    "utf8",
  );
  // Official Sonar chart uses legacy app=sonarqube labels.
  assert.match(sonar, /app:\s*sonarqube/);
});

test("INT-315 / INT-328 — Kyverno engine + int-apps/demo-apps baseline policies", async () => {
  const engine = await readFile("deploy/argocd/platform/kyverno.yaml", "utf8");
  assert.match(engine, /name: platform-kyverno/);
  assert.match(engine, /chart: kyverno/);
  assert.match(engine, /targetRevision: 3\.9\.2/);
  const policiesApp = await readFile(
    "deploy/argocd/platform/kyverno-policies.yaml",
    "utf8",
  );
  assert.match(policiesApp, /path: deploy\/charts\/kyverno-policies/);
  const values = await readFile(
    "deploy/charts/kyverno-policies/values.yaml",
    "utf8",
  );
  assert.match(values, /appsNamespaces:[\s\S]*int-apps[\s\S]*demo-apps/);
  const tpl = await readFile(
    "deploy/charts/kyverno-policies/templates/require-nonroot.yaml",
    "utf8",
  );
  assert.match(tpl, /kind: ClusterPolicy/);
  assert.match(tpl, /name: apps-require-nonroot/);
  assert.match(tpl, /appsNamespaces/);
  assert.match(tpl, /runAsNonRoot: true/);
  assert.match(tpl, /drop:[\s\S]*ALL/);
});

test("INT-312 / INT-328 — namespace PSA labels chart + Argo app", async () => {
  const chart = await readFile("deploy/charts/namespace-psa/Chart.yaml", "utf8");
  assert.match(chart, /^name: namespace-psa$/m);
  const values = await readFile(
    "deploy/charts/namespace-psa/values.yaml",
    "utf8",
  );
  assert.match(values, /name:\s*int-apps/);
  assert.match(values, /name:\s*demo-apps/);
  assert.match(values, /name:\s*demo-data/);
  assert.match(values, /enforce:\s*baseline/);
  assert.match(values, /audit:\s*restricted/);
  const tpl = await readFile(
    "deploy/charts/namespace-psa/templates/namespaces.yaml",
    "utf8",
  );
  assert.match(tpl, /pod-security\.kubernetes\.io\/enforce/);
  assert.match(tpl, /helm\.sh\/resource-policy:\s*keep/);
  const app = await readFile(
    "deploy/argocd/platform/namespace-psa.yaml",
    "utf8",
  );
  assert.match(app, /name: platform-namespace-psa/);
  assert.match(app, /path: deploy\/charts\/namespace-psa/);
  assert.match(app, /ServerSideApply=true/);
});

test("INT-328 — OTel attributes/redact covers common PII keys", async () => {
  const otel = await readFile(
    "deploy/platform/otel-collector/values.yaml",
    "utf8",
  );
  assert.match(otel, /attributes\/redact/);
  for (const key of [
    "email",
    "name",
    "phone",
    "iban",
    "address",
    "tax_id",
    "vat_number",
  ]) {
    assert.match(otel, new RegExp(`key:\\s*${key}\\b`), key);
  }
});

test("INT-289 — APISIX security headers helper on public routes", async () => {
  const helpers = await readFile(
    "deploy/charts/apisix-gateway/templates/_helpers.tpl",
    "utf8",
  );
  assert.match(helpers, /apisix-gateway\.securityHeadersPlugin/);
  assert.match(helpers, /response-rewrite/);
  assert.match(helpers, /Strict-Transport-Security/);
  assert.match(helpers, /Content-Security-Policy/);

  const routes = await readFile(
    "deploy/charts/apisix-gateway/templates/routes.yaml",
    "utf8",
  );
  assert.match(routes, /securityHeadersPlugin/);
  assert.match(routes, /name: web-app[\s\S]*plugins:/);

  const values = await readFile(
    "deploy/charts/apisix-gateway/values.yaml",
    "utf8",
  );
  assert.match(values, /securityHeaders:/);
  assert.match(values, /X-Content-Type-Options|contentTypeOptions:\s*nosniff/);
});
