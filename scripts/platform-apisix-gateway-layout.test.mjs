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
  assert.match(demo, /REPLACE_WITH_RELEASE_TAG/);
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

  const helpers = await readFile(
    "deploy/charts/apisix-gateway/templates/_helpers.tpl",
    "utf8",
  );
  assert.match(helpers, /openid-connect/);
  assert.match(helpers, /bearer_only/);

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
  assert.equal(/\bclient_secret\b/.test(values), false);
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

  const chartValues = await readFile(
    "deploy/charts/apisix-gateway/values.yaml",
    "utf8",
  );
  assert.match(chartValues, /issuerRef:/);
  assert.match(chartValues, /letsencrypt-staging/);

  const dev = await readFile(
    "deploy/envs/dev/apisix-gateway-values.yaml",
    "utf8",
  );
  assert.match(dev, /tls:\s*\n\s*enabled:\s*true/);
  assert.match(dev, /letsencrypt-staging/);
});

test("letsencrypt issuer is staging by default (INT-114)", async () => {
  const app = await readFile(
    "deploy/argocd/platform/letsencrypt-issuer.yaml",
    "utf8",
  );
  assert.match(app, /sync-wave: "3"/);
  assert.match(app, /path: deploy\/charts\/letsencrypt-issuer/);

  const tpl = await readFile(
    "deploy/charts/letsencrypt-issuer/templates/clusterissuer.yaml",
    "utf8",
  );
  assert.match(tpl, /letsencrypt-staging/);
  assert.match(tpl, /acme-staging-v02\.api\.letsencrypt\.org/);
  assert.match(tpl, /ingressClassName/);
});

test("platform README documents gateway routes (INT-114)", async () => {
  const text = await readFile("deploy/platform/README.md", "utf8");
  assert.match(text, /INT-114/);
  assert.match(text, /apisix-gateway/);
  assert.match(text, /letsencrypt-issuer/);
});
