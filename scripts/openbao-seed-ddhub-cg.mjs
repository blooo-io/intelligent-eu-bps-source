#!/usr/bin/env node
/**
 * INT-308 / INT-429 — prepare OpenBao for DDHub Client Gateway (Phase 1).
 *
 * Enables KV v1 at mount path `ddhub/` (CG writes `ddhub/mnemonic` etc., not
 * under secret/), creates a limited token, stores it at secret/platform/ddhub.
 * Also seeds a placeholder CGW API key at secret/ddhub/api-key (NFR-017;
 * real key is minted when USER_AUTH_ENABLED is switched on in INT-309).
 *
 * Usage (merged branch — INT-157):
 *   KUBECONFIG=… node scripts/openbao-seed-ddhub-cg.mjs --check
 *   KUBECONFIG=… node scripts/openbao-seed-ddhub-cg.mjs --apply
 */

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { operatorEnv } from "./lib/operator-env.mjs";

const NS = "openbao";
const POD = "platform-openbao-0";
const BOOTSTRAP_SECRET = "openbao-dev-bootstrap";
const POLICY = `path "ddhub/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
path "sys/init" {
  capabilities = ["read"]
}
path "sys/health" {
  capabilities = ["read"]
}
`;

function kubectl(args) {
  const result = spawnSync("kubectl", args, {
    encoding: "utf8",
    env: operatorEnv(),
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `kubectl ${args.join(" ")} failed: ${(result.stderr || result.stdout || "").trim().slice(0, 400)}`,
    );
  }
  return (result.stdout || "").trim();
}

function rootToken() {
  const b64 = kubectl([
    "-n",
    NS,
    "get",
    "secret",
    BOOTSTRAP_SECRET,
    "-o",
    "jsonpath={.data.root_token}",
  ]);
  return Buffer.from(b64, "base64").toString("utf8");
}

function bao(token, script) {
  // BAO_ADDR is required inside the pod — without it some bao CLI paths
  // (sys/mounts) return permission denied even with a root token (INT-439).
  const result = spawnSync(
    "kubectl",
    [
      "-n",
      NS,
      "exec",
      POD,
      "--",
      "sh",
      "-c",
      `BAO_ADDR=http://127.0.0.1:8200 BAO_TOKEN='${token}' ${script}`,
    ],
    { encoding: "utf8", env: operatorEnv(), maxBuffer: 10 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(
      `bao via kubectl failed: ${(result.stderr || result.stdout || "").trim().slice(0, 500)}`,
    );
  }
  return (result.stdout || "").trim();
}

export function checkLayout() {
  return {
    mount: "ddhub/ (KV v1)",
    kvPath: "secret/platform/ddhub",
    property: "vault_token",
    apiKeyPath: "secret/ddhub/api-key",
    apiKeyProperty: "CGW_API_KEY",
    note: "CG SECRET_PREFIX=ddhub/ expects a KV engine mounted at ddhub/, not secret/ddhub; billing modules read CGW_API_KEY from secret/ddhub/api-key via ExternalSecret",
  };
}

export function applyDdhubCgOpenbao() {
  if (!process.env.KUBECONFIG) {
    throw new Error("KUBECONFIG is required for --apply");
  }
  const token = rootToken();
  // Enable KV v1 at ddhub/ only when missing (idempotent; INT-439).
  bao(
    token,
    'bao secrets list -format=json 2>/dev/null | grep -q \'"ddhub/"\' || bao secrets enable -path=ddhub -version=1 kv',
  );
  const policyB64 = Buffer.from(POLICY).toString("base64");
  bao(
    token,
    `echo '${policyB64}' | base64 -d | bao policy write ddhub-cg -`,
  );
  const created = bao(
    token,
    "bao token create -policy=ddhub-cg -ttl=768h -format=json",
  );
  const parsed = JSON.parse(created.slice(created.indexOf("{")));
  const cgToken = parsed.auth.client_token;
  bao(
    token,
    `bao kv put -mount=secret platform/ddhub vault_token='${cgToken}' seeded=true`,
  );
  // INT-429 / NFR-017 — placeholder only; real key lands with USER_AUTH_ENABLED (INT-309).
  bao(
    token,
    "bao kv put -mount=secret ddhub/api-key CGW_API_KEY='dev-only-replace-me' seeded=true",
  );
  return {
    applied: true,
    mount: "ddhub/",
    platformPath: "secret/platform/ddhub",
    apiKeyPath: "secret/ddhub/api-key",
    tokenTtl: "768h",
  };
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const args = new Set(process.argv.slice(2));
  if (args.has("--check")) {
    console.log(JSON.stringify(checkLayout()));
  } else if (args.has("--apply")) {
    console.log(JSON.stringify(applyDdhubCgOpenbao()));
  } else {
    console.error("Usage: --check | --apply");
    process.exit(2);
  }
}
