/**
 * INT-169 — Keycloak realm import packaging (int / demo + apisix-gateway client).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Keycloak realms Argo app and ConfigMap chart (INT-169)", async () => {
  const app = await readFile("deploy/argocd/platform/keycloak-realms.yaml", "utf8");
  assert.match(app, /sync-wave: "2"/);
  assert.match(app, /path: deploy\/charts\/keycloak-realms/);
  assert.match(app, /namespace: keycloak/);
  assert.match(app, /automated:/);

  const intRealm = await readFile(
    "deploy/charts/keycloak-realms/realms/int-realm.json",
    "utf8",
  );
  assert.match(intRealm, /"realm": "int"/);
  assert.match(intRealm, /"clientId": "apisix-gateway"/);
  assert.match(intRealm, /"clientId": "web"/);
  assert.match(intRealm, /dev-only-replace-me/);
  // INT-179 — community_id claim + billing roles for portal principal headers.
  assert.match(intRealm, /"claim.name": "community_id"/);
  assert.match(intRealm, /"name": "member"/);
  assert.match(intRealm, /"name": "operator"/);

  const demoRealm = await readFile(
    "deploy/charts/keycloak-realms/realms/demo-realm.json",
    "utf8",
  );
  assert.match(demoRealm, /"realm": "demo"/);
  assert.match(demoRealm, /"clientId": "apisix-gateway"/);
  assert.match(demoRealm, /"claim.name": "community_id"/);
});
