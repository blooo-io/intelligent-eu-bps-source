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
  // INT-194 — UAT IdP users for authenticated portal / wizard smoke.
  assert.match(intRealm, /"username": "uat-member"/);
  assert.match(intRealm, /"username": "uat-manager"/);
  assert.match(intRealm, /"username": "uat-operator"/);
  assert.match(intRealm, /Intelligent-UAT-2026!/);
  // INT-236 / INT-241 — S1 IdP users (community c0ffee00…) for one identity chain.
  assert.match(intRealm, /"username": "s1-consumer"/);
  assert.match(intRealm, /"username": "s1-producer-a"/);
  assert.match(intRealm, /"username": "s1-producer-b"/);
  assert.match(intRealm, /"username": "s1-manager"/);
  assert.match(intRealm, /c0ffee00-1234-4abc-8def-0123456789ab/);
  // INT-215 — AC-03 Keycloak Admin service account + realm-management roles.
  assert.match(intRealm, /"clientId": "participants-admin"/);
  assert.match(intRealm, /"serviceAccountClientId": "participants-admin"/);
  assert.match(intRealm, /"manage-users"/);

  const demoRealm = await readFile(
    "deploy/charts/keycloak-realms/realms/demo-realm.json",
    "utf8",
  );
  assert.match(demoRealm, /"realm": "demo"/);
  assert.match(demoRealm, /"clientId": "apisix-gateway"/);
  assert.match(demoRealm, /"claim.name": "community_id"/);
});
