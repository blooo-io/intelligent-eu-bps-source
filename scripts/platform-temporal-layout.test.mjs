/**
 * INT-159 / TD-3 — Temporal packaging layout (CNPG DB + official Helm chart).
 * INT-172 — namespace registration Job (int / demo).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Temporal Argo apps land in temporal with sync waves (INT-159 / INT-172)", async () => {
  const db = await readFile("deploy/argocd/platform/cnpg-temporal.yaml", "utf8");
  assert.match(db, /sync-wave: "1"/);
  assert.match(db, /path: deploy\/charts\/cnpg-temporal/);
  assert.match(db, /namespace: temporal/);

  const server = await readFile("deploy/argocd/platform/temporal.yaml", "utf8");
  assert.match(server, /sync-wave: "2"/);
  assert.match(server, /chart: temporal/);
  assert.match(server, /targetRevision: 1\.7\.0/);
  assert.match(server, /namespace: temporal/);
  assert.match(server, /automated:/);

  const ns = await readFile(
    "deploy/argocd/platform/temporal-namespaces.yaml",
    "utf8",
  );
  assert.match(ns, /sync-wave: "3"/);
  assert.match(ns, /path: deploy\/charts\/temporal-namespaces/);
  assert.match(ns, /namespace: temporal/);
  assert.match(ns, /automated:/);
});

test("Temporal namespaces Job is idempotent and secret-free (INT-172)", async () => {
  const values = await readFile(
    "deploy/charts/temporal-namespaces/values.yaml",
    "utf8",
  );
  assert.match(values, /frontendAddress: platform-temporal-frontend:7233/);
  assert.match(values, /name: int/);
  assert.match(values, /name: demo/);
  assert.match(values, /temporalio\/admin-tools/);
  assert.equal(values.includes("stringData:"), false);

  const job = await readFile(
    "deploy/charts/temporal-namespaces/templates/job.yaml",
    "utf8",
  );
  assert.match(job, /kind: Job/);
  assert.match(job, /operator namespace create/);
  assert.match(job, /operator namespace describe/);
  assert.match(job, /runAsNonRoot: true/);
  assert.match(job, /readOnlyRootFilesystem: true/);
  assert.match(job, /argocd\.argoproj\.io\/hook: Sync/);
  assert.equal(job.includes("stringData:"), false);
});

test("Temporal values use SQL on CNPG and small shard count for V1", async () => {
  const values = await readFile("deploy/platform/temporal/values.yaml", "utf8");
  assert.match(values, /numHistoryShards: 1/);
  assert.match(values, /pluginName: postgres12/);
  assert.match(values, /existingSecret: temporal/);
  assert.match(values, /temporal-rw\.temporal\.svc\.cluster\.local:5432/);
  assert.match(values, /databaseName: temporal_visibility/);
  assert.equal(values.includes("stringData:"), false);
  assert.equal(/grafana/i.test(values), false);
  assert.equal(/\bpassword:\s*['\"]?\w+/.test(values), false);

  const db = await readFile(
    "deploy/charts/cnpg-temporal/templates/cluster.yaml",
    "utf8",
  );
  assert.match(db, /kind: Password/);
  // INT-163 — ESO Password CRD requires integer counts (not bool).
  assert.match(db, /^\s*digits:\s*\d+\s*$/m);
  assert.match(db, /^\s*symbols:\s*\d+\s*$/m);
  assert.equal(/\bdigits:\s*(true|false)\b/.test(db), false);
  assert.equal(/\bsymbols:\s*(true|false)\b/.test(db), false);
  assert.match(db, /passwordSecret:/);
  assert.match(db, /refreshInterval: "0"/);
});

test("platform README documents Temporal packaging (INT-159 / INT-172)", async () => {
  const text = await readFile("deploy/platform/README.md", "utf8");
  assert.match(text, /INT-159/);
  assert.match(text, /INT-172/);
  assert.match(text, /TD-3/);
  assert.match(text, /numHistoryShards: 1/);
  assert.match(text, /cnpg-temporal/);
  assert.match(text, /temporal-namespaces/);
  assert.match(text, /platform-temporal-namespaces/);
});
