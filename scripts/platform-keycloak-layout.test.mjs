/**
 * INT-160 — Keycloak IdP packaging layout (CNPG DB + keycloakx + admin ExternalSecret).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Keycloak Argo apps land in keycloak with sync waves (INT-160)", async () => {
  const db = await readFile("deploy/argocd/platform/cnpg-keycloak.yaml", "utf8");
  assert.match(db, /sync-wave: "1"/);
  assert.match(db, /path: deploy\/charts\/cnpg-keycloak/);
  assert.match(db, /namespace: keycloak/);
  assert.match(db, /automated:/);

  const admin = await readFile(
    "deploy/argocd/platform/keycloak-admin-secret.yaml",
    "utf8",
  );
  assert.match(admin, /sync-wave: "2"/);
  assert.match(admin, /path: deploy\/charts\/keycloak-admin-secret/);

  const kc = await readFile("deploy/argocd/platform/keycloak.yaml", "utf8");
  assert.match(kc, /sync-wave: "2"/);
  assert.match(kc, /chart: keycloakx/);
  assert.match(kc, /targetRevision: 7\.4\.0/);
  assert.match(kc, /namespace: keycloak/);
});

test("Keycloak values use official image and secret refs only", async () => {
  const values = await readFile("deploy/platform/keycloak/values.yaml", "utf8");
  assert.match(values, /repository: quay\.io\/keycloak\/keycloak/);
  assert.match(values, /existingSecret: keycloak/);
  assert.match(values, /name: keycloak-admin/);
  assert.equal(values.includes("stringData:"), false);
  assert.equal(/\bpassword:\s*['\"]?\w+/.test(values), false);
  assert.equal(/bitnami/i.test(values), false);

  const es = await readFile(
    "deploy/charts/keycloak-admin-secret/templates/externalsecret.yaml",
    "utf8",
  );
  assert.match(es, /kind: ExternalSecret/);
  assert.match(es, /key: \{\{ \.Values\.openbaoPath \}\}/);
  assert.equal(/^\s*kind:\s*Secret\s*$/m.test(es), false);

  const db = await readFile(
    "deploy/charts/cnpg-keycloak/templates/cluster.yaml",
    "utf8",
  );
  assert.match(db, /kind: Password/);
  assert.match(db, /passwordSecret:/);
  assert.match(db, /refreshInterval: "0"/);
});

test("platform README documents Keycloak packaging (INT-160)", async () => {
  const text = await readFile("deploy/platform/README.md", "utf8");
  assert.match(text, /INT-160/);
  assert.match(text, /keycloakx/);
  assert.match(text, /platform\/keycloak/);
  assert.match(text, /dev-only-replace-me/);
});
