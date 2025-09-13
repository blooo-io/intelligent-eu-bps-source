/**
 * INT-133 / TD-9 — platform secrets & certificates packaging layout.
 * Covers packaging for NFR-001 / NFR-005 (UAT-033 stays Not Run until cluster smoke).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const platformApps = [
  "external-secrets",
  "cert-manager",
  "openbao",
  "openbao-store",
  "nats",
];

test("platform Argo apps exist with sync waves for ESO before store (INT-133)", async () => {
  for (const name of platformApps) {
    const text = await readFile(`deploy/argocd/platform/${name}.yaml`, "utf8");
    assert.match(text, /kind: Application/);
    assert.match(text, /targetRevision:/);
    assert.match(text, /automated:/);
  }

  const eso = await readFile("deploy/argocd/platform/external-secrets.yaml", "utf8");
  assert.match(eso, /sync-wave: "0"/);
  assert.match(eso, /chart: external-secrets/);
  assert.match(eso, /targetRevision: 2\.13\.0/);
  assert.match(eso, /namespace: external-secrets/);

  const cm = await readFile("deploy/argocd/platform/cert-manager.yaml", "utf8");
  assert.match(cm, /sync-wave: "1"/);
  assert.match(cm, /chart: cert-manager/);
  assert.match(cm, /targetRevision: v1\.21\.2/);

  const bao = await readFile("deploy/argocd/platform/openbao.yaml", "utf8");
  assert.match(bao, /sync-wave: "1"/);
  assert.match(bao, /chart: openbao/);
  assert.match(bao, /targetRevision: 0\.30\.4/);

  const store = await readFile("deploy/argocd/platform/openbao-store.yaml", "utf8");
  assert.match(store, /sync-wave: "2"/);
  assert.match(store, /path: deploy\/charts\/openbao-store/);
});

test("platform values pin resources and contain no secret material", async () => {
  for (const file of [
    "deploy/platform/external-secrets/values.yaml",
    "deploy/platform/cert-manager/values.yaml",
    "deploy/platform/openbao/values.yaml",
    "deploy/charts/openbao-store/values.yaml",
  ]) {
    const text = await readFile(file, "utf8");
    assert.equal(text.includes("stringData:"), false, file);
    assert.equal(/^\s*kind:\s*Secret\s*$/m.test(text), false, file);
    // No obvious token/password assignments in values.
    assert.equal(/\btoken:\s*['\"]?[A-Za-z0-9._-]{8,}/.test(text), false, file);
  }

  const bao = await readFile("deploy/platform/openbao/values.yaml", "utf8");
  assert.match(bao, /injector:\s*\n\s*enabled:\s*false/);
  assert.match(bao, /standalone:\s*\n\s*enabled:\s*true/);
});

test("ClusterSecretStore is named openbao to match module ExternalSecrets", async () => {
  const template = await readFile(
    "deploy/charts/openbao-store/templates/clustersecretstore.yaml",
    "utf8",
  );
  assert.match(template, /kind: ClusterSecretStore/);
  assert.match(template, /name: \{\{ \.Values\.storeName \}\}/);

  const values = await readFile("deploy/charts/openbao-store/values.yaml", "utf8");
  assert.match(values, /^storeName: openbao$/m);

  const moduleTpl = await readFile(
    "deploy/charts/module/templates/_resources.tpl",
    "utf8",
  );
  assert.match(moduleTpl, /kind: ClusterSecretStore/);
  assert.match(moduleTpl, /name: openbao/);
});

test("platform README documents operator init without embedding secrets (INT-133)", async () => {
  const text = await readFile("deploy/platform/README.md", "utf8");
  assert.match(text, /INT-133/);
  assert.match(text, /openbao-eso-token/);
  assert.match(text, /kubectl apply -f deploy\/argocd\/platform\//);
  assert.match(text, /Do not `helm install`/);
});
