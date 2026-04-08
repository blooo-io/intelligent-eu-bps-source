import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// INT-132 / TD-7: NATS JetStream (shared) + Debezium Server (per env data ns).

test("nats chart enables JetStream and exposes client port 4222", async () => {
  const values = await readFile("deploy/charts/nats/values.yaml", "utf8");
  assert.match(values, /jetstream:\s*\n\s*enabled:\s*true/);
  assert.match(values, /clientPort:\s*4222/);
  const chart = await readFile("deploy/charts/nats/Chart.yaml", "utf8");
  assert.match(chart, /^name: nats$/m);
});

test("nats Argo application lands in the shared nats namespace", async () => {
  const text = await readFile("deploy/argocd/platform/nats.yaml", "utf8");
  assert.match(text, /targetRevision: develop/);
  assert.match(text, /namespace: nats/);
  assert.match(text, /path: deploy\/charts\/nats/);
  assert.match(text, /automated:/);
});

test("debezium-server chart sinks to NATS JetStream and stays secret-free", async () => {
  const values = await readFile("deploy/charts/debezium-server/values.yaml", "utf8");
  // INT-214 — CDC enabled once outbox tables exist (INT-213 bootstrap).
  assert.match(values, /replicaCount:\s*1/);
  assert.match(values, /nats\.nats\.svc\.cluster\.local/);
  assert.match(values, /database:\s*payments/);
  assert.match(values, /database:\s*settlement/);
  assert.match(values, /stream:\s*intelligent/);
  const template = await readFile(
    "deploy/charts/debezium-server/templates/resources.yaml",
    "utf8",
  );
  assert.match(template, /debezium\.sink\.type=nats-jetstream/);
  assert.match(template, /table\.include\.list=public\.outbox/);
  assert.match(template, /table\.field\.event\.type=type/);
  assert.match(template, /route\.by\.field=type/);
  assert.match(template, /create-stream=true/);
  assert.match(template, /kind: ExternalSecret/);
  assert.equal(template.includes("stringData:"), false);
  assert.match(template, /runAsNonRoot: true/);
});

test("debezium-server Argo apps land in data namespaces", async () => {
  const dev = await readFile("deploy/argocd/dev/debezium-server.yaml", "utf8");
  assert.match(dev, /targetRevision: develop/);
  assert.match(dev, /namespace: int-data/);
  assert.match(dev, /automated:/);

  const demo = await readFile("deploy/argocd/demo/debezium-server.yaml", "utf8");
  assert.equal(demo.includes("automated:"), false);
  assert.equal(demo.includes("targetRevision: develop"), false);
  assert.match(demo, /namespace: demo-data/);
});

test("helmfile releases debezium-server into the data namespace", async () => {
  const text = await readFile("deploy/helmfile/helmfile.yaml", "utf8");
  assert.match(text, /- name: debezium-server\n/);
  assert.match(text, /namespace: "\{\{ \.Values\.dataNamespace \}\}"/);
  // Shared NATS must not be a per-env helmfile release (would double-install).
  assert.equal(/\n  - name: nats\n/.test(text), false);
});
