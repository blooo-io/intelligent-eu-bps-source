/**
 * INT-286 / INT-287 / INT-288 / INT-289 — security hardening packaging.
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
