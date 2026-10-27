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
  // INT-332 — Volt login theme (AC-01 / INT-250).
  assert.match(intRealm, /"loginTheme": "intelligent"/);
  assert.match(intRealm, /"clientId": "apisix-gateway"/);
  assert.match(intRealm, /"clientId": "web"/);
  // INT-325 — no client secrets / UAT passwords in Git realm JSON.
  assert.equal(/"secret"\s*:/.test(intRealm), false);
  assert.equal(/Intelligent-UAT-2026!/.test(intRealm), false);
  assert.equal(/"credentials"\s*:/.test(intRealm), false);
  // INT-179 — community_id claim + billing roles for portal principal headers.
  assert.match(intRealm, /"claim.name": "community_id"/);
  assert.match(intRealm, /"name": "member"/);
  assert.match(intRealm, /"name": "operator"/);
  // INT-194 / INT-282 — UAT IdP users (human-readable logins) for portal smoke.
  assert.match(intRealm, /"username": "hugo\.petit"/);
  assert.match(intRealm, /"username": "sofia\.garcia"/);
  assert.match(intRealm, /"username": "paul\.nguyen"/);
  // INT-236 / INT-241 / INT-282 — S1 IdP users (community c0ffee00…).
  assert.match(intRealm, /"username": "lea\.martin"/);
  assert.match(intRealm, /"username": "thomas\.bernard"/);
  assert.match(intRealm, /"username": "claire\.dubois"/);
  assert.match(intRealm, /"username": "marie\.leroy"/);
  assert.match(intRealm, /"username": "hugo\.moreau"/);
  assert.match(intRealm, /c0ffee00-1234-4abc-8def-0123456789ab/);
  // INT-215 — AC-03 Keycloak Admin service account + realm-management roles.
  assert.match(intRealm, /"clientId": "participants-admin"/);
  assert.match(intRealm, /"serviceAccountClientId": "participants-admin"/);
  assert.match(intRealm, /"manage-users"/);
  // INT-287 — inter-module service JWT client + service realm role.
  assert.match(intRealm, /"clientId": "module-service"/);
  assert.match(intRealm, /"serviceAccountClientId": "module-service"/);
  assert.match(intRealm, /"name": "service"/);
  // INT-314 — in-cluster HTTP token mint (Cilium 100.64/10 vs sslRequired=external).
  assert.match(intRealm, /"sslRequired": "none"/);

  const demoRealm = await readFile(
    "deploy/charts/keycloak-realms/realms/demo-realm.json",
    "utf8",
  );
  assert.match(demoRealm, /"realm": "demo"/);
  assert.match(demoRealm, /"loginTheme": "intelligent"/);
  assert.match(demoRealm, /"clientId": "apisix-gateway"/);
  assert.match(demoRealm, /"claim.name": "community_id"/);
  assert.match(demoRealm, /"clientId": "module-service"/);
  assert.match(demoRealm, /"serviceAccountClientId": "module-service"/);
});

test("Keycloak Volt login theme packaging (INT-332)", async () => {
  const props = await readFile(
    "deploy/charts/keycloak-realms/themes/intelligent/login/theme.properties",
    "utf8",
  );
  assert.match(props, /parent=keycloak\.v2/);
  assert.match(props, /styles=css\/login\.css/);

  const css = await readFile(
    "deploy/charts/keycloak-realms/themes/intelligent/login/resources/css/login.css",
    "utf8",
  );
  assert.match(css, /#0[Aa]0[Ff]0[Dd]/);
  assert.match(css, /#?[Cc]8[Ff]542/);
  assert.match(css, /Plus Jakarta Sans/);

  const themeCm = await readFile(
    "deploy/charts/keycloak-realms/templates/theme-configmap.yaml",
    "utf8",
  );
  assert.match(themeCm, /name: keycloak-theme-intelligent/);
  assert.match(themeCm, /themes\/intelligent\/login\/theme\.properties/);
  assert.match(
    themeCm,
    /themes\/intelligent\/login\/resources\/css\/login\.css/,
  );
});
