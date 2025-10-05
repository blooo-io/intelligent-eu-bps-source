/**
 * INT-161 / TD-8 — APISIX gateway packaging layout (Admin Secret + official chart).
 * Covers REQ-010 / NFR-001 packaging path; full routes stay on INT-114.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("APISIX Argo apps land in ingress with sync waves (INT-161)", async () => {
  const secret = await readFile(
    "deploy/argocd/platform/apisix-admin-secret.yaml",
    "utf8",
  );
  assert.match(secret, /sync-wave: "2"/);
  assert.match(secret, /path: deploy\/charts\/apisix-admin-secret/);
  assert.match(secret, /namespace: ingress/);
  assert.match(secret, /automated:/);

  const gw = await readFile("deploy/argocd/platform/apisix.yaml", "utf8");
  assert.match(gw, /sync-wave: "3"/);
  assert.match(gw, /chart: apisix/);
  assert.match(gw, /targetRevision: 2\.12\.4/);
  assert.match(gw, /namespace: ingress/);
  assert.match(gw, /charts\.apiseven\.com/);
  assert.match(gw, /automated:/);
});

test("APISIX values use secret refs and enable Ingress Controller", async () => {
  const values = await readFile("deploy/platform/apisix/values.yaml", "utf8");
  assert.match(values, /secretName: apisix-admin/);
  assert.match(values, /type: LoadBalancer/);
  assert.match(values, /ingress-controller:\s*\n\s*enabled: true/);
  assert.match(values, /ingressClass: apisix/);
  assert.match(values, /replicaCount: 1/);
  assert.equal(values.includes("stringData:"), false);
  assert.equal(/edd1c9f034335f136f87ad84b625c8f1/.test(values), false);
  assert.equal(/\badmin:\s*['\"]?[a-f0-9]{16,}/.test(values), false);

  const es = await readFile(
    "deploy/charts/apisix-admin-secret/templates/externalsecret.yaml",
    "utf8",
  );
  assert.match(es, /kind: ExternalSecret/);
  assert.match(es, /key: \{\{ \.Values\.openbaoPath \}\}/);
  assert.match(es, /property: admin/);
  assert.match(es, /property: viewer/);
  assert.equal(/^\s*kind:\s*Secret\s*$/m.test(es), false);
});

test("platform README documents APISIX packaging (INT-161)", async () => {
  const text = await readFile("deploy/platform/README.md", "utf8");
  assert.match(text, /INT-161/);
  assert.match(text, /TD-8/);
  assert.match(text, /apisix/);
  assert.match(text, /platform\/apisix/);
});
