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
  // INT-331 — V1/dev retention + memory cap.
  assert.match(prom, /retention:\s*2d/);
  assert.match(prom, /retentionSize:\s*5GB/);
  assert.match(prom, /memory:\s*384Mi/);
  assert.match(prom, /memory:\s*1Gi/);

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
  // INT-331 — tighten collector memory limit for V1/dev.
  assert.match(otel, /memory:\s*384Mi/);
  assert.match(otel, /limit_percentage:\s*75/);
  assert.equal(/grafana/i.test(otel), false);
});

test("Alertmanager routes critical / warning alerts to Slack via an optional Secret (INT-358)", async () => {
  const prom = await readFile("deploy/platform/kube-prometheus/values.yaml", "utf8");
  assert.match(prom, /slack_api_url_file: \/etc\/alertmanager\/slack\/webhook_url/);
  assert.equal(/slack_api_url:/.test(prom), false);
  assert.equal(/hooks\.slack\.com/.test(prom), false);
  assert.match(prom, /receiver: 'null'\n\s+routes:/);
  assert.match(prom, /- receiver: 'null'\n\s+matchers:\n\s+- alertname =~ "Watchdog\|InfoInhibitor"/);
  assert.match(prom, /- receiver: slack\n\s+matchers:\n\s+- severity =~ "critical\|warning"/);
  assert.match(prom, /- name: 'null'\n\s+- name: slack\n\s+slack_configs:/);
  assert.match(prom, /send_resolved: true/);
  assert.match(
    prom,
    /volumes:\n\s+- name: slack-webhook\n\s+secret:\n\s+secretName: alertmanager-slack\n\s+optional: true/,
  );
  assert.match(prom, /mountPath: \/etc\/alertmanager\/slack/);

  const app = await readFile(
    "deploy/argocd/platform/alertmanager-slack-secret.yaml",
    "utf8",
  );
  assert.match(app, /kind: Application/);
  assert.match(app, /name: platform-alertmanager-slack-secret/);
  assert.match(app, /sync-wave: "2"/);
  assert.match(app, /path: deploy\/charts\/alertmanager-slack-secret/);
  assert.match(app, /namespace: observability/);
  assert.match(app, /targetRevision: develop/);
  assert.match(app, /automated:/);

  const values = await readFile(
    "deploy/charts/alertmanager-slack-secret/values.yaml",
    "utf8",
  );
  assert.match(values, /^storeName: openbao$/m);
  assert.match(values, /^secretName: alertmanager-slack$/m);
  assert.match(values, /^secretKey: webhook_url$/m);
  assert.match(values, /^openbaoPath: platform\/alertmanager$/m);
  assert.match(values, /^openbaoProperty: slack_webhook_url$/m);

  const tpl = await readFile(
    "deploy/charts/alertmanager-slack-secret/templates/externalsecret.yaml",
    "utf8",
  );
  assert.match(tpl, /kind: ExternalSecret/);
  assert.match(tpl, /kind: ClusterSecretStore/);
  assert.match(tpl, /secretKey: \{\{ \.Values\.secretKey \}\}/);
  assert.match(tpl, /key: \{\{ \.Values\.openbaoPath \}\}/);
  assert.equal(/^\s*kind:\s*Secret\s*$/m.test(tpl), false);
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
  assert.match(text, /INT-358/);
  assert.match(text, /alertmanager-slack-secret/);
  assert.match(text, /platform\/alertmanager/);
});
