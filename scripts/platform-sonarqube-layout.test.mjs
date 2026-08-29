/**
 * INT-292 — SonarQube Community Build packaging layout
 * (CNPG DB + official Helm chart + monitoring ExternalSecret + APISIX host).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("SonarQube Argo apps land in sonarqube with sync waves (INT-292)", async () => {
  const db = await readFile("deploy/argocd/platform/cnpg-sonarqube.yaml", "utf8");
  assert.match(db, /sync-wave: "1"/);
  assert.match(db, /path: deploy\/charts\/cnpg-sonarqube/);
  assert.match(db, /namespace: sonarqube/);
  assert.match(db, /automated:/);

  const mon = await readFile(
    "deploy/argocd/platform/sonarqube-monitoring-secret.yaml",
    "utf8",
  );
  assert.match(mon, /sync-wave: "2"/);
  assert.match(mon, /path: deploy\/charts\/sonarqube-monitoring-secret/);

  const admin = await readFile(
    "deploy/argocd/platform/sonarqube-admin-secret.yaml",
    "utf8",
  );
  assert.match(admin, /sync-wave: "2"/);
  assert.match(admin, /path: deploy\/charts\/sonarqube-admin-secret/);

  const sq = await readFile("deploy/argocd/platform/sonarqube.yaml", "utf8");
  assert.match(sq, /sync-wave: "2"/);
  assert.match(sq, /chart: sonarqube/);
  assert.match(sq, /targetRevision: 2026\.5\.1002/);
  assert.match(sq, /SonarSource\.github\.io\/helm-chart-sonarqube/);
  assert.match(sq, /namespace: sonarqube/);
  assert.match(sq, /deploy\/platform\/sonarqube\/values\.yaml/);
});

test("SonarQube values enable Community Build and secret refs only", async () => {
  const values = await readFile("deploy/platform/sonarqube/values.yaml", "utf8");
  assert.match(values, /community:\s*\n\s*enabled:\s*true/);
  assert.match(values, /jdbcOverwrite:\s*\n\s*enabled:\s*true/);
  assert.match(values, /sonarqube-rw\.sonarqube\.svc\.cluster\.local/);
  assert.match(values, /jdbcSecretName:\s*sonarqube/);
  assert.match(values, /monitoringPasscodeSecretName:\s*sonarqube-monitoring/);
  assert.match(values, /fullnameOverride:\s*platform-sonarqube/);
  assert.equal(values.includes("stringData:"), false);
  assert.equal(/\bjdbcPassword:\s*['\"]?\w+/.test(values), false);
  assert.equal(/\bmonitoringPasscode:\s*['\"]?\w+/.test(values), false);

  const es = await readFile(
    "deploy/charts/sonarqube-monitoring-secret/templates/externalsecret.yaml",
    "utf8",
  );
  assert.match(es, /kind: ExternalSecret/);
  assert.match(es, /key: \{\{ \.Values\.openbaoPath \}\}/);
  assert.equal(/^\s*kind:\s*Secret\s*$/m.test(es), false);

  const db = await readFile(
    "deploy/charts/cnpg-sonarqube/templates/cluster.yaml",
    "utf8",
  );
  assert.match(db, /kind: Password/);
  assert.match(db, /^\s*digits:\s*\d+\s*$/m);
  assert.match(db, /^\s*symbols:\s*\d+\s*$/m);
  assert.match(db, /passwordSecret:/);
  assert.match(db, /refreshInterval: "0"/);
});

test("APISIX exposes sonar host without Keycloak OIDC (INT-292)", async () => {
  const values = await readFile("deploy/charts/apisix-gateway/values.yaml", "utf8");
  assert.match(values, /sonar:\s*sonar\.intelligent-eu-bp\.blooo\.dev/);
  assert.match(values, /platform-sonarqube\.sonarqube\.svc\.cluster\.local/);

  const routes = await readFile(
    "deploy/charts/apisix-gateway/templates/routes.yaml",
    "utf8",
  );
  assert.match(routes, /name:\s*sonarqube/);
  assert.match(routes, /hosts\.sonar/);
  assert.equal(/sonarqube[\s\S]*openid-connect/.test(routes), false);

  const backends = await readFile(
    "deploy/charts/apisix-gateway/templates/backends.yaml",
    "utf8",
  );
  assert.match(backends, /name:\s*sonarqube/);
  assert.match(backends, /backends\.sonarqube/);

  const tls = await readFile(
    "deploy/charts/apisix-gateway/templates/tls.yaml",
    "utf8",
  );
  assert.match(tls, /hosts\.sonar/);
  assert.match(tls, /name" "sonar"/);

  const dev = await readFile("deploy/envs/dev/apisix-gateway-values.yaml", "utf8");
  assert.match(dev, /sonar:\s*sonar\.intelligent-eu-bp\.blooo\.dev/);
});

test("platform README and release docs cover SonarQube cluster (INT-292)", async () => {
  const readme = await readFile("deploy/platform/README.md", "utf8");
  assert.match(readme, /INT-292/);
  assert.match(readme, /community\.enabled/);
  assert.match(readme, /platform\/sonarqube/);
  assert.match(readme, /sonar\.intelligent-eu-bp\.blooo\.dev/);

  const release = await readFile("docs/release/sonarqube.md", "utf8");
  assert.match(release, /INT-292/);
  assert.match(release, /SONAR_HOST_URL/);
  assert.match(release, /sonar\.intelligent-eu-bp\.blooo\.dev/);
  assert.match(release, /platform-sonarqube/);
});
