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
  // INT-167 — must invoke `kc.sh start` (empty chart args print help and exit).
  assert.match(values, /^args:\s*\n\s*-\s*start\s*$/m);
  assert.match(values, /proxy:\s*\n\s*enabled:\s*true/);
  assert.match(values, /http:\s*\n\s*enabled:\s*true/);
  // INT-165 — chart proxy.http.enabled already sets KC_HTTP_ENABLED; do not duplicate in extraEnv.
  assert.equal(/\bname:\s*KC_HTTP_ENABLED\b/.test(values), false);
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
  // INT-163 — ESO Password CRD requires integer counts (not bool).
  assert.match(db, /^\s*digits:\s*\d+\s*$/m);
  assert.match(db, /^\s*symbols:\s*\d+\s*$/m);
  assert.equal(/\bdigits:\s*(true|false)\b/.test(db), false);
  assert.equal(/\bsymbols:\s*(true|false)\b/.test(db), false);
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
