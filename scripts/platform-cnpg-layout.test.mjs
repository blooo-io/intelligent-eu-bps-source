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
  // INT-163 — ESO Password CRD requires integer counts (not bool).
  assert.match(template, /^\s*digits:\s*\d+\s*$/m);
  assert.match(template, /^\s*symbols:\s*\d+\s*$/m);
  assert.equal(/\bdigits:\s*(true|false)\b/.test(template), false);
  assert.equal(/\bsymbols:\s*(true|false)\b/.test(template), false);
  assert.match(template, /kind: ExternalSecret/);
  assert.match(template, /passwordSecret:/);
  assert.match(template, /refreshInterval: "0"/);
  // INT-164 — Secret names are DNS-1123 (kebab-case); role usernames may keep underscores.
  assert.match(template, /\$secretName := \.name \| replace "_" "-"/);
  assert.equal(/target:\s*\n\s*name:\s*\{\{\s*\.name\s*\}\}/.test(template), false);
  assert.match(template, /username: \{\{ \.name \| quote \}\}/);
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

test("int-data Cluster archives WAL and takes daily base backups to nl-ams (INT-358 / PD-4)", async () => {
  const values = await readFile("deploy/charts/cnpg-int-data/values.yaml", "utf8");
  // Packaged but off until buckets and OpenBao paths exist (INT-358).
  assert.match(values, /^backup:\n\s+enabled: false$/m);
  assert.match(values, /^\s+retentionPolicy: 7d$/m);
  assert.match(values, /endpointURL: https:\/\/s3\.nl-ams\.scw\.cloud/);
  assert.match(values, /^\s+region: nl-ams$/m);
  assert.match(values, /destinationPath: s3:\/\/intelligent-eu-bps-backups-dev\//);
  assert.match(values, /walCompression: gzip/);
  assert.match(values, /schedule: "0 0 2 \* \* \*"/);
  assert.match(values, /^\s+storeName: openbao$/m);
  assert.match(values, /^\s+openbaoPath: dev\/cnpg-backup$/m);
  assert.equal(/access_?key_?id:\s*\S+/i.test(values), false);
  assert.equal(/secret_?access_?key:\s*\S+/i.test(values), false);

  const demo = await readFile("deploy/charts/cnpg-int-data/values-demo.yaml", "utf8");
  assert.match(demo, /^\s+retentionPolicy: 30d$/m);
  assert.match(demo, /destinationPath: s3:\/\/intelligent-eu-bps-backups-demo\//);
  assert.match(demo, /^\s+openbaoPath: demo\/cnpg-backup$/m);

  const cluster = await readFile(
    "deploy/charts/cnpg-int-data/templates/cluster.yaml",
    "utf8",
  );
  assert.match(cluster, /\{\{- if \.Values\.backup\.enabled \}\}\n\s+# [^\n]*\n\s+backup:/);
  assert.match(cluster, /barmanObjectStore:/);
  assert.match(cluster, /retentionPolicy: \{\{ \.Values\.backup\.retentionPolicy \| quote \}\}/);
  assert.match(cluster, /endpointURL: \{\{ \.Values\.backup\.endpointURL \| quote \}\}/);
  assert.match(cluster, /s3Credentials:/);
  assert.match(cluster, /name: \{\{ \.Values\.clusterName \}\}-backup-s3/);
  assert.match(cluster, /wal:\s*\n\s+compression: \{\{ \.Values\.backup\.walCompression \}\}/);
  assert.match(cluster, /target: prefer-standby/);

  const backup = await readFile(
    "deploy/charts/cnpg-int-data/templates/backup.yaml",
    "utf8",
  );
  assert.match(backup, /\{\{- if \.Values\.backup\.enabled \}\}/);
  assert.match(backup, /kind: ExternalSecret/);
  assert.match(backup, /kind: ClusterSecretStore/);
  assert.match(backup, /name: \{\{ \.Values\.backup\.storeName \}\}/);
  assert.match(backup, /key: \{\{ \.Values\.backup\.openbaoPath \}\}/);
  assert.match(backup, /property: access_key_id/);
  assert.match(backup, /property: secret_access_key/);
  assert.match(backup, /ACCESS_KEY_ID:/);
  assert.match(backup, /ACCESS_SECRET_KEY:/);
  assert.match(backup, /cnpg\.io\/reload: "true"/);
  assert.match(backup, /kind: ScheduledBackup/);
  assert.match(backup, /schedule: \{\{ \.Values\.backup\.schedule \| quote \}\}/);
  assert.match(backup, /method: barmanObjectStore/);
  assert.match(backup, /immediate: true/);
  assert.match(backup, /backupOwnerReference: self/);
  assert.equal(/^\s*kind:\s*Secret\s*$/m.test(backup), false);
  assert.equal(backup.includes("stringData:"), false);

  // PITR goes through Git: recovery is off by default and reuses the backup credentials.
  assert.match(values, /^recovery:\n\s+enabled: false$/m);
  assert.match(values, /^\s+sourceServerName: int-data$/m);
  assert.match(demo, /^\s+sourceServerName: demo-data$/m);
  assert.match(cluster, /\{\{- with \.Values\.backup\.serverName \}\}/);
  assert.match(cluster, /\{\{- if \.Values\.recovery\.enabled \}\}/);
  assert.match(cluster, /fail "recovery\.enabled needs backup\.enabled/);
  assert.match(cluster, /recovery:\n\s+source: origin/);
  assert.match(cluster, /targetTime: \{\{ \. \| quote \}\}/);
  assert.match(cluster, /externalClusters:\n\s+- name: origin/);
  assert.match(cluster, /serverName: \{\{ \.Values\.recovery\.sourceServerName \| quote \}\}/);

  const demoApp = await readFile("deploy/argocd/demo/cnpg-demo-data.yaml", "utf8");
  assert.match(demoApp, /- values\.yaml\n(\s+#[^\n]*\n)?\s+- values-demo\.yaml/);
});

test("platform README documents CNPG packaging (INT-158)", async () => {
  const text = await readFile("deploy/platform/README.md", "utf8");
  assert.match(text, /INT-158/);
  assert.match(text, /cloudnative-pg/);
  assert.match(text, /cnpg-int-data/);
  assert.match(text, /never in Git/);
  assert.match(text, /INT-358/);
  assert.match(text, /dev\/cnpg-backup/);
  assert.match(text, /demo\/cnpg-backup/);
});

test("deployment note documents backup seeding, verification and PITR (INT-358)", async () => {
  const text = await readFile("docs/release/deployment.md", "utf8");
  assert.match(text, /INT-358/);
  assert.match(text, /dev\/cnpg-backup/);
  assert.match(text, /demo\/cnpg-backup/);
  assert.match(text, /access_key_id/);
  assert.match(text, /secret_access_key/);
  assert.match(text, /ContinuousArchiving/);
  assert.match(text, /recoveryTarget/);
  assert.match(text, /targetTime/);
  assert.match(text, /platform\/alertmanager/);
  assert.match(text, /slack_webhook_url/);
});

test("outbox-bootstrap RBAC uses Role rules at top level (INT-213)", async () => {
  const text = await readFile(
    "deploy/charts/cnpg-int-data/templates/outbox-bootstrap.yaml",
    "utf8",
  );
  assert.match(text, /kind: Role\n/);
  assert.match(text, /kind: RoleBinding\n/);
  assert.match(text, /^rules:\n/m);
  assert.match(text, /^roleRef:\n/m);
  assert.match(text, /outbox-bootstrap-write/);
  assert.match(text, /namespace: int-apps/);
  // Native Role/RoleBinding must not nest under a CRD-style `spec:`.
  assert.equal(/\nspec:\n\s+rules:/.test(text), false);
  assert.equal(/\nspec:\n\s+roleRef:/.test(text), false);
});
