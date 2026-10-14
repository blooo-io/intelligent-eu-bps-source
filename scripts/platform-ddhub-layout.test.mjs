/**
 * INT-308 — DDHub Client Gateway GitOps packaging layout
 * (CNPG DB + OCI Helm chart + ExternalSecret + NetworkPolicy).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("DDHub Argo apps land in ddhub with sync waves (INT-308)", async () => {
  const db = await readFile("deploy/argocd/platform/cnpg-ddhub.yaml", "utf8");
  assert.match(db, /sync-wave: "2"/);
  assert.match(db, /path: deploy\/charts\/cnpg-ddhub/);
  assert.match(db, /namespace: ddhub/);
  assert.match(db, /automated:/);

  const secret = await readFile(
    "deploy/argocd/platform/ddhub-gateway-secret.yaml",
    "utf8",
  );
  assert.match(secret, /sync-wave: "2"/);
  assert.match(secret, /path: deploy\/charts\/ddhub-gateway-secret/);
  assert.match(secret, /namespace: ddhub/);

  const cg = await readFile(
    "deploy/argocd/platform/ddhub-client-gateway.yaml",
    "utf8",
  );
  assert.match(cg, /sync-wave: "3"/);
  assert.match(cg, /chart: ddhub-client-gateway-api/);
  assert.match(cg, /targetRevision: 1\.3\.0-ewc/);
  assert.match(cg, /ewfcontainerregistry\.azurecr\.io\/helm/);
  assert.match(cg, /namespace: ddhub/);
  assert.match(cg, /deploy\/platform\/ddhub-client-gateway\/values\.yaml/);
});

test("DDHub values keep Phase 1 auth off and secret refs only", async () => {
  const values = await readFile(
    "deploy/platform/ddhub-client-gateway/values.yaml",
    "utf8",
  );
  assert.match(values, /mtls_enabled:\s*false/);
  assert.match(values, /USER_AUTH_ENABLED:\s*"false"/);
  assert.match(values, /websocket:\s*NONE/);
  assert.match(values, /ui:[\s\S]*?enabled:\s*false/);
  assert.match(values, /^ingress:\s*\n\s*enabled:\s*false/m);
  assert.match(values, /dsb_base_url:\s*https:\/\/ddhub-ewc\.energyweb\.org/);
  assert.match(values, /platform-openbao\.openbao\.svc\.cluster\.local/);
  assert.match(values, /fullnameOverride:\s*ddhub-client-gateway/);
  assert.equal(values.includes("stringData:"), false);
  assert.equal(/\bVAULT_TOKEN:\s*['\"]?\w+/.test(values), false);
  assert.equal(/\bDB_NAME:\s*['\"]?postgresql:/.test(values), false);

  const esValues = await readFile(
    "deploy/charts/ddhub-gateway-secret/values.yaml",
    "utf8",
  );
  assert.match(esValues, /ddhub-rw\.ddhub\.svc\.cluster\.local/);
  assert.match(esValues, /secretName:\s*ddhub-client-gateway-secret/);

  const es = await readFile(
    "deploy/charts/ddhub-gateway-secret/templates/externalsecret.yaml",
    "utf8",
  );
  assert.match(es, /kind: ExternalSecret/);
  assert.match(es, /DB_NAME:/);
  assert.match(es, /VAULT_TOKEN:/);
  assert.match(es, /\.Values\.dbHost/);
  assert.equal(/^\s*kind:\s*Secret\s*$/m.test(es), false);

  const np = await readFile(
    "deploy/charts/ddhub-gateway-secret/templates/networkpolicy.yaml",
    "utf8",
  );
  assert.match(np, /kind: NetworkPolicy/);
  assert.match(np, /kubernetes\.io\/metadata\.name: openbao/);
  assert.match(np, /port: 443/);

  const db = await readFile(
    "deploy/charts/cnpg-ddhub/templates/cluster.yaml",
    "utf8",
  );
  assert.match(db, /kind: ExternalSecret/);
  assert.match(db, /kind: Cluster/);
  assert.match(db, /passwordSecret:/);
  assert.match(db, /platform\/ddhub|openbaoPath/);
});

test("platform README, release docs and TP-2 cover DDHub CG (INT-308)", async () => {
  const readme = await readFile("deploy/platform/README.md", "utf8");
  assert.match(readme, /INT-308/);
  assert.match(readme, /ddhub-client-gateway-api/);
  assert.match(readme, /platform\/ddhub-client-gateway/);
  assert.match(readme, /TP-2/);

  const release = await readFile("docs/release/ddhub-client-gateway.md", "utf8");
  assert.match(release, /INT-308/);
  assert.match(release, /1\.3\.0-ewc/);
  assert.match(release, /platform-ddhub-client-gateway/);
  assert.match(release, /GPL-3\.0/);

  const td = await readFile(
    "docs/architecture/04-technical-architecture.md",
    "utf8",
  );
  assert.match(td, /DDHub Client Gateway/);
  assert.match(td, /INT-308/);
  assert.match(td, /GPL-3\.0/);

  const plan = await readFile("docs/architecture/ewds-client-gateway.md", "utf8");
  assert.match(plan, /INT-308/);
  assert.match(plan, /platform-ddhub-client-gateway|cnpg-ddhub/);
});
