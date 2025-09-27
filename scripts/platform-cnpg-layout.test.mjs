/**
 * INT-158 / TD-6 — CloudNativePG packaging layout for int-data.
 * Covers NFR-003 / NFR-005 packaging; UAT-035 stays Not Run until cluster smoke.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("CNPG operator Argo app lands in cnpg-system (INT-158)", async () => {
  const text = await readFile("deploy/argocd/platform/cloudnative-pg.yaml", "utf8");
  assert.match(text, /kind: Application/);
  assert.match(text, /sync-wave: "0"/);
  assert.match(text, /chart: cloudnative-pg/);
  assert.match(text, /targetRevision: 0\.29\.1/);
  assert.match(text, /namespace: cnpg-system/);
  assert.match(text, /automated:/);
  assert.match(text, /CreateNamespace=true/);
});

test("int-data Cluster chart has one DB per module and no secrets", async () => {
  const values = await readFile("deploy/charts/cnpg-int-data/values.yaml", "utf8");
  assert.match(values, /^clusterName: int-data$/m);
  assert.match(values, /wal_level: logical/);
  assert.match(values, /module: participants/);
  assert.match(values, /name: trade_intake/);
  assert.match(values, /module: trade-intake/);
  assert.match(values, /name: reference_data/);
  assert.equal(values.includes("stringData:"), false);
  assert.equal(/\bpassword:\s*\S+/.test(values), false);

  const template = await readFile(
    "deploy/charts/cnpg-int-data/templates/cluster.yaml",
    "utf8",
  );
  assert.match(template, /kind: Cluster/);
  assert.match(template, /kind: Database/);
  assert.match(template, /kind: Password/);
  assert.match(template, /kind: ExternalSecret/);
  assert.match(template, /passwordSecret:/);
  assert.match(template, /refreshInterval: "0"/);
  assert.match(template, /managed:\s*\n\s*roles:/);
  assert.match(template, /ensure: present/);
  assert.equal(/^\s*kind:\s*Secret\s*$/m.test(template), false);
  assert.equal(template.includes("stringData:"), false);
});

test("dev CNPG app tracks develop; demo stays manual", async () => {
  const dev = await readFile("deploy/argocd/dev/cnpg-int-data.yaml", "utf8");
  assert.match(dev, /targetRevision: develop/);
  assert.match(dev, /namespace: int-data/);
  assert.match(dev, /path: deploy\/charts\/cnpg-int-data/);
  assert.match(dev, /automated:/);

  const demo = await readFile("deploy/argocd/demo/cnpg-demo-data.yaml", "utf8");
  assert.equal(demo.includes("automated:"), false);
  assert.equal(demo.includes("targetRevision: develop"), false);
  assert.match(demo, /namespace: demo-data/);
});

test("platform README documents CNPG packaging (INT-158)", async () => {
  const text = await readFile("deploy/platform/README.md", "utf8");
  assert.match(text, /INT-158/);
  assert.match(text, /cloudnative-pg/);
  assert.match(text, /cnpg-int-data/);
  assert.match(text, /never in Git/);
});
