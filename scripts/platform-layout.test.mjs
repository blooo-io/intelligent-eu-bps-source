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
  // INT-378 — include is relative to /etc/nats; auth.conf is projected beside nats.conf.
  const template = await readFile("deploy/charts/nats/templates/resources.yaml", "utf8");
  assert.match(template, /include "auth\.conf"/);
  assert.match(template, /projected:/);
  assert.equal(/include "\/etc\/nats-accounts/.test(template), false);
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
  // INT-221 — Debezium Server 2.7 hardcodes stream name DebeziumStream.
  assert.match(values, /stream:\s*DebeziumStream/);
  const template = await readFile(
    "deploy/charts/debezium-server/templates/resources.yaml",
    "utf8",
  );
  assert.match(template, /debezium\.sink\.type=nats-jetstream/);
  assert.match(template, /table\.include\.list=public\.outbox/);
  assert.match(template, /table\.field\.event\.type=type/);
  assert.match(template, /route\.by\.field=type/);
  // INT-220 — publication.name (not database.publication.name); no autocreate.
  assert.match(template, /debezium\.source\.publication\.name=dbz_outbox/);
  assert.match(template, /publication\.autocreate\.mode=disabled/);
  assert.equal(/debezium\.source\.database\.publication\.name=/.test(template), false);
  // Quarkus must see $${routedByValue}; bare ${} NPEs in configToProperties.
  assert.match(template, /route\.topic\.replacement=intelligent\.\{\{ \$\.Values\.environment \}\}\.\$\$\{routedByValue\}/);
  assert.match(template, /create-stream=true/);
  assert.match(template, /kind: ExternalSecret/);
  assert.equal(template.includes("stringData:"), false);
  assert.match(template, /runAsNonRoot: true/);
  assert.equal(/envFrom:[\s\S]*name: \{\{ \$\.Values\.name \}\}/.test(template), false);
});

test("debezium-server Argo apps land in data namespaces", async () => {
  const dev = await readFile("deploy/argocd/dev/debezium-server.yaml", "utf8");
  assert.match(dev, /targetRevision: develop/);
  assert.match(dev, /namespace: int-data/);
  assert.match(dev, /automated:/);
  // INT-214 — must not merge envs/dev image.tag=develop over quay.io tag.
  assert.equal(dev.includes("envs/dev/values.yaml"), false);

  const demo = await readFile("deploy/argocd/demo/debezium-server.yaml", "utf8");
  assert.equal(demo.includes("automated:"), false);
  assert.equal(demo.includes("targetRevision: develop"), false);
  assert.match(demo, /namespace: demo-data/);
  assert.equal(demo.includes("envs/demo/values.yaml"), false);
});

test("helmfile releases debezium-server into the data namespace", async () => {
  const text = await readFile("deploy/helmfile/helmfile.yaml", "utf8");
  assert.match(text, /- name: debezium-server\n/);
  assert.match(text, /namespace: "\{\{ \.Values\.dataNamespace \}\}"/);
  // Shared NATS must not be a per-env helmfile release (would double-install).
  assert.equal(/\n  - name: nats\n/.test(text), false);
});

test("notification consumes DebeziumStream (INT-221)", async () => {
  const values = await readFile("deploy/charts/notification/values.yaml", "utf8");
  assert.match(values, /NATS_STREAM:\s*DebeziumStream/);
  assert.equal(/NATS_STREAM:\s*intelligent\b/.test(values), false);
});

test("scheduler worker pulls GHCR via image.pullSecret and avoids env dup (INT-216)", async () => {
  const worker = await readFile(
    "deploy/charts/scheduler/templates/worker.yaml",
    "utf8",
  );
  assert.match(worker, /imagePullSecrets:/);
  assert.match(worker, /\.Values\.image\.pullSecret/);
  assert.match(worker, /hasKey \(\.Values\.env \| default dict\) "TEMPORAL_TASK_QUEUE"/);
  // INT-219 — args keeps distroless node entrypoint; command would replace it.
  assert.match(worker, /args: \["dist\/temporal\/worker\.js"\]/);
  assert.equal(worker.includes('command: ["dist/temporal/worker.js"]'), false);
});
