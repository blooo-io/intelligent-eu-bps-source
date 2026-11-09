/**
 * INT-114 / TD-8 — APISIX public route catalogue layout.
 * Covers REQ-010 / REQ-033 packaging path; UAT stays Not Run until cluster smoke.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dev APISIX gateway Argo app lands in ingress wave 4 (INT-114)", async () => {
  const text = await readFile("deploy/argocd/dev/apisix-gateway.yaml", "utf8");
  assert.match(text, /sync-wave: "4"/);
  assert.match(text, /path: deploy\/charts\/apisix-gateway/);
  assert.match(text, /namespace: ingress/);
  assert.match(text, /automated:/);
  assert.match(text, /apisix-gateway-values\.yaml/);

  const demo = await readFile("deploy/argocd/demo/apisix-gateway.yaml", "utf8");
  assert.equal(demo.includes("automated:"), false);
  assert.match(demo, /targetRevision: v1\.0\.1/);
});

test("gateway chart has webhook without OIDC and /v1 with openid-connect", async () => {
  const routes = await readFile(
    "deploy/charts/apisix-gateway/templates/routes.yaml",
    "utf8",
  );
  assert.match(routes, /kind: ApisixRoute/);
  assert.match(routes, /Values\.webhook\.path/);
  assert.match(routes, /limit-req/);
  assert.match(routes, /apisix-gateway\.oidcPlugin/);
  assert.match(routes, /auth-idp/);
  assert.match(routes, /web-app/);
  // INT-218 — AC-09 paths must not fall through to participants /v1/communities/*.
  assert.match(routes, /communities\/\*\/payments-overview/);
  assert.match(routes, /participants\/\*\/history/);
  assert.match(routes, /name: reporting[\s\S]*priority: 60/);
  // INT-170 / INT-171 — Keycloak KC_PROXY_HEADERS=forwarded needs RFC7239 Forwarded.
  assert.match(routes, /proxy-rewrite/);
  assert.match(routes, /Forwarded:/);
  assert.match(routes, /proto=https/);
  assert.match(routes, /X-Forwarded-Proto:\s*https/);

  const helpers = await readFile(
    "deploy/charts/apisix-gateway/templates/_helpers.tpl",
    "utf8",
  );
  assert.match(helpers, /openid-connect/);
  assert.match(helpers, /bearer_only/);
  // INT-169 — client_secret via Secret, never inlined in the route.
  assert.match(helpers, /secretRef:/);
  assert.equal(/client_secret:/.test(helpers), false);
  // INT-179 — map validated JWT claims to Nest principal headers.
  assert.match(helpers, /serverless-pre-function/);
  assert.match(helpers, /x-intelligent-sub/);
  assert.match(helpers, /x-intelligent-roles/);
  assert.match(helpers, /x-intelligent-community/);
  assert.match(helpers, /phase:\s*access/);
  // INT-187 — CORS before OIDC so OPTIONS preflight succeeds for the SPA.
  assert.match(helpers, /name:\s*cors/);
  assert.match(helpers, /allow_origins/);
  assert.match(helpers, /apisix-gateway\.corsPlugin/);
  // INT-289 — security response headers on OIDC routes.
  assert.match(helpers, /apisix-gateway\.securityHeadersPlugin/);
  assert.match(helpers, /Strict-Transport-Security/);
  // INT-327 / TD-8 — rate-limit authenticated /v1 after OIDC (per client IP).
  assert.match(helpers, /name:\s*limit-req/);
  assert.match(helpers, /Values\.api\.rate\.rate/);
  assert.match(helpers, /Values\.api\.rate\.burst/);
  assert.match(helpers, /rejected_code:\s*429/);

  const oidcEs = await readFile(
    "deploy/charts/apisix-gateway/templates/oidc-secret.yaml",
    "utf8",
  );
  assert.match(oidcEs, /kind: ExternalSecret/);
  assert.match(oidcEs, /openbaoProperty/);

  const chartValues = await readFile(
    "deploy/charts/apisix-gateway/values.yaml",
    "utf8",
  );
  assert.match(chartValues, /openbaoProperty: oidc_client_secret/);
  assert.match(chartValues, /secretName: apisix-oidc/);

  const backends = await readFile(
    "deploy/charts/apisix-gateway/templates/backends.yaml",
    "utf8",
  );
  assert.match(backends, /type: ExternalName/);
  assert.match(backends, /appsNamespace/);
  assert.match(backends, /backends\.keycloak\.externalName/);

  const values = await readFile("deploy/charts/apisix-gateway/values.yaml", "utf8");
  assert.match(values, /webhooks\/payment-provider/);
  assert.match(values, /platform-keycloak-keycloakx-http/);
  assert.equal(values.includes("stringData:"), false);
  // Property name oidc_client_secret is fine; never inline a secret value in values.
  assert.equal(/\bclient_secret:\s*['\"]?\w+/.test(values), false);
  assert.match(values, /cors:/);
  assert.match(values, /allowOrigins:/);
  assert.match(values, /app\.dev\.intelligent-eu-bp\.blooo\.dev/);
  // INT-327 — /v1 catalogue rate defaults (webhook already has its own block).
  assert.match(values, /api:\s*\n\s*rate:\s*\n\s*rate:\s*\d+/);
  assert.match(values, /webhook:\s*\n[\s\S]*rate:\s*\n\s*rate:\s*\d+/);
});

test("role claim path is configuration on gateway, modules and web (NFR-013 / INT-357)", async () => {
  const helpers = await readFile(
    "deploy/charts/apisix-gateway/templates/_helpers.tpl",
    "utf8",
  );
  assert.match(helpers, /define "apisix-gateway\.roleClaim"/);
  assert.match(helpers, /Values\.oidc\.roleClaim \| default "realm_access\.roles"/);
  // Value is inlined in Lua source: render must fail on anything but a safe dot-path.
  assert.match(helpers, /regexMatch/);
  assert.match(helpers, /fail \(printf "oidc\.roleClaim/);
  assert.match(helpers, /string\.gmatch\(\{\{ include "apisix-gateway\.roleClaim" \. \| quote \}\}/);
  assert.equal(/claims\.realm_access/.test(helpers), false);

  const values = await readFile("deploy/charts/apisix-gateway/values.yaml", "utf8");
  assert.match(values, /oidc:[\s\S]*\n\s+roleClaim: realm_access\.roles\n/);

  const modules = [
    "compliance", "invoicing", "notification", "participants", "payments",
    "publication", "reconciliation", "reference-data", "reporting",
    "scheduler", "settlement", "trade-intake", "web",
  ];
  for (const name of modules) {
    const chart = await readFile(`deploy/charts/${name}/values.yaml`, "utf8");
    assert.match(
      chart,
      /\n {2}OIDC_ROLE_CLAIM: realm_access\.roles\n/,
      `${name} chart must expose OIDC_ROLE_CLAIM`,
    );
  }
});

test("gateway TLS templates gate Certificate and ApisixTls (INT-168)", async () => {
  const tls = await readFile(
    "deploy/charts/apisix-gateway/templates/tls.yaml",
    "utf8",
  );
  assert.match(tls, /Values\.tls\.enabled/);
  assert.match(tls, /kind: Certificate/);
  assert.match(tls, /kind: ApisixTls/);
  assert.match(tls, /issuerRef:/);
  assert.match(tls, /secretName: tls-/);
  // INT-174 — Replace + reload annotations so issuer flips re-push SSL into etcd.
  assert.match(tls, /argocd\.argoproj\.io\/sync-options: Replace=true/);
  assert.match(tls, /intelligent\.blooo\.io\/tls-issuer/);
  assert.match(tls, /intelligent\.blooo\.io\/tls-reload/);

  const chartValues = await readFile(
    "deploy/charts/apisix-gateway/values.yaml",
    "utf8",
  );
  assert.match(chartValues, /issuerRef:/);
  assert.match(chartValues, /letsencrypt-prod/);
  assert.match(chartValues, /reloadGeneration:/);
  assert.match(chartValues, /sslVerify:\s*true/);

  const dev = await readFile(
    "deploy/envs/dev/apisix-gateway-values.yaml",
    "utf8",
  );
  assert.match(dev, /tls:\s*\n\s*enabled:\s*true/);
  assert.match(dev, /letsencrypt-prod/);
  assert.match(dev, /reloadGeneration:/);
});

test("letsencrypt production issuer enabled after staging smoke (INT-173)", async () => {
  const app = await readFile(
    "deploy/argocd/platform/letsencrypt-issuer.yaml",
    "utf8",
  );
  assert.match(app, /sync-wave: "3"/);
  assert.match(app, /path: deploy\/charts\/letsencrypt-issuer/);

  const values = await readFile(
    "deploy/charts/letsencrypt-issuer/values.yaml",
    "utf8",
  );
  assert.match(values, /useProduction:\s*true/);

  const tpl = await readFile(
    "deploy/charts/letsencrypt-issuer/templates/clusterissuer.yaml",
    "utf8",
  );
  assert.match(tpl, /letsencrypt-staging/);
  assert.match(tpl, /acme-staging-v02\.api\.letsencrypt\.org/);
  assert.match(tpl, /letsencrypt-prod/);
  assert.match(tpl, /acme-v02\.api\.letsencrypt\.org/);
  assert.match(tpl, /ingressClassName/);
});

test("platform README documents gateway routes (INT-114 / INT-173 / INT-174)", async () => {
  const text = await readFile("deploy/platform/README.md", "utf8");
  assert.match(text, /INT-114/);
  assert.match(text, /apisix-gateway/);
  assert.match(text, /letsencrypt-issuer/);
  assert.match(text, /letsencrypt-prod/);
  assert.match(text, /INT-173/);
  assert.match(text, /INT-174/);
  assert.match(text, /reloadGeneration/);
  assert.match(text, /INT-179/);
  assert.match(text, /x-intelligent-/);
  assert.match(text, /INT-327/);
  assert.match(text, /api\.rate|\/v1.*rate-limit|rate-limit.*\/v1/i);
});
