/**
 * INT-134 / TD-10 — observability packaging layout (OTel, Prometheus, Jaeger,
 * VictoriaLogs, Perses). Grafana must stay out (AGPL). Covers NFR-015 packaging;
 * UAT-066 stays Not Run until cluster smoke after Argo sync.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const obsApps = [
  "kube-prometheus",
  "jaeger",
  "victoria-logs",
  "otel-collector",
  "perses",
];

test("observability Argo apps land in observability with sync waves (INT-134)", async () => {
  for (const name of obsApps) {
    const text = await readFile(`deploy/argocd/platform/${name}.yaml`, "utf8");
    assert.match(text, /kind: Application/);
    assert.match(text, /namespace: observability/);
    assert.match(text, /targetRevision: develop/);
    assert.match(text, /automated:/);
    assert.match(text, /CreateNamespace=true/);
  }

  const prom = await readFile("deploy/argocd/platform/kube-prometheus.yaml", "utf8");
  assert.match(prom, /sync-wave: "0"/);
  assert.match(prom, /chart: kube-prometheus-stack/);
  assert.match(prom, /targetRevision: 92\.10\.0/);

  const jaeger = await readFile("deploy/argocd/platform/jaeger.yaml", "utf8");
  assert.match(jaeger, /sync-wave: "1"/);
  assert.match(jaeger, /chart: jaeger/);
  assert.match(jaeger, /targetRevision: 4\.16\.1/);

  const vl = await readFile("deploy/argocd/platform/victoria-logs.yaml", "utf8");
  assert.match(vl, /sync-wave: "1"/);
  assert.match(vl, /chart: victoria-logs-single/);
  assert.match(vl, /targetRevision: 0\.13\.10/);

  const otel = await readFile("deploy/argocd/platform/otel-collector.yaml", "utf8");
  assert.match(otel, /sync-wave: "2"/);
  assert.match(otel, /chart: opentelemetry-collector/);
  assert.match(otel, /targetRevision: 0\.176\.0/);

  const perses = await readFile("deploy/argocd/platform/perses.yaml", "utf8");
  assert.match(perses, /sync-wave: "2"/);
  assert.match(perses, /chart: perses/);
  assert.match(perses, /targetRevision: 0\.23\.3/);

  // INT-327 — security PrometheusRules after kube-prometheus CRDs.
  const rulesApp = await readFile(
    "deploy/argocd/platform/prometheus-rules.yaml",
    "utf8",
  );
  assert.match(rulesApp, /kind: Application/);
  assert.match(rulesApp, /name: platform-prometheus-rules/);
  assert.match(rulesApp, /sync-wave: "1"/);
  assert.match(rulesApp, /path: deploy\/charts\/prometheus-rules/);
  assert.match(rulesApp, /namespace: observability/);
  assert.match(rulesApp, /automated:/);
  assert.match(rulesApp, /targetRevision: develop/);
});

test("observability values disable Grafana and contain no secret material", async () => {
  for (const file of [
    "deploy/platform/kube-prometheus/values.yaml",
    "deploy/platform/jaeger/values.yaml",
    "deploy/platform/victoria-logs/values.yaml",
    "deploy/platform/otel-collector/values.yaml",
    "deploy/platform/perses/values.yaml",
  ]) {
    const text = await readFile(file, "utf8");
    assert.equal(text.includes("stringData:"), false, file);
    assert.equal(/^\s*kind:\s*Secret\s*$/m.test(text), false, file);
    assert.equal(/\btoken:\s*['\"]?[A-Za-z0-9._-]{8,}/.test(text), false, file);
    assert.equal(/\bpassword:\s*['\"]?\S+/.test(text), false, file);
  }

  const prom = await readFile("deploy/platform/kube-prometheus/values.yaml", "utf8");
  assert.match(prom, /grafana:\s*\n\s*enabled:\s*false/);
  assert.match(prom, /alertmanager:\s*\n\s*enabled:\s*true/);
  // INT-327 — discover PrometheusRules outside the stack release.
  assert.match(prom, /ruleSelectorNilUsesHelmValues:\s*false/);

  const rulesChart = await readFile(
    "deploy/charts/prometheus-rules/Chart.yaml",
    "utf8",
  );
  assert.match(rulesChart, /^name: prometheus-rules$/m);

  const rulesTpl = await readFile(
    "deploy/charts/prometheus-rules/templates/security.yaml",
    "utf8",
  );
  assert.match(rulesTpl, /kind: PrometheusRule/);
  assert.match(rulesTpl, /IntelligentCertificateExpiringSoon/);
  assert.match(rulesTpl, /IntelligentExternalSecretNotReady/);
  assert.match(rulesTpl, /IntelligentKyvernoPolicyFailure/);
  assert.match(rulesTpl, /IntelligentKubeJobFailed/);

  const rulesValues = await readFile(
    "deploy/charts/prometheus-rules/values.yaml",
    "utf8",
  );
  assert.match(rulesValues, /release:\s*kube-prometheus/);

  const otel = await readFile("deploy/platform/otel-collector/values.yaml", "utf8");
  assert.match(otel, /^mode: deployment$/m);
  assert.match(otel, /attributes\/redact/);
  assert.match(otel, /platform-jaeger\.observability\.svc\.cluster\.local:4317/);
  assert.match(otel, /platform-victoria-logs-server\.observability\.svc\.cluster\.local:9428/);
  assert.equal(/grafana/i.test(otel), false);
});

test("platform README documents TD-10 stack without Grafana (INT-134)", async () => {
  const text = await readFile("deploy/platform/README.md", "utf8");
  assert.match(text, /INT-134/);
  assert.match(text, /TD-10/);
  assert.match(text, /kube-prometheus-stack/);
  assert.match(text, /opentelemetry-collector/);
  assert.match(text, /victoria-logs-single/);
  assert.match(text, /Perses/);
  assert.match(text, /grafana\.enabled: false/);
  assert.match(text, /Grafana is not packaged/);
  assert.match(text, /Do not `helm install`/);
  assert.match(text, /INT-327/);
  assert.match(text, /prometheus-rules|PrometheusRule/);
});
