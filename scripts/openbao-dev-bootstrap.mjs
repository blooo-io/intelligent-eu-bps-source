#!/usr/bin/env node
/**
 * INT-133 / TD-9 — V1 / non-production OpenBao bootstrap (no Shamir multi-share).
 *
 * Uses a single unseal key (`-key-shares=1 -key-threshold=1`). Keys stay in a
 * cluster Secret only — never printed and never committed to Git.
 *
 * Usage:
 *   node scripts/openbao-dev-bootstrap.mjs --check
 *   node scripts/openbao-dev-bootstrap.mjs --print
 *   KUBECONFIG=… node scripts/openbao-dev-bootstrap.mjs --apply
 */

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { operatorEnv } from "./lib/operator-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NS = "openbao";
const POD = "platform-openbao-0";
const BOOTSTRAP_SECRET = "openbao-dev-bootstrap";
const ESO_NS = "external-secrets";
const ESO_TOKEN_SECRET = "openbao-eso-token";

function kubectl(args, { input, env } = {}) {
  const result = spawnSync("kubectl", args, {
    encoding: "utf8",
    input,
    env: env ?? operatorEnv(),
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || "").trim();
    throw new Error(`kubectl ${args.join(" ")} failed: ${err.slice(0, 400)}`);
  }
  return (result.stdout || "").trim();
}

function bao(args, { token } = {}) {
  const prefix = token ? ["env", `BAO_TOKEN=${token}`] : [];
  return kubectl(["-n", NS, "exec", POD, "--", ...prefix, "bao", ...args]);
}

export async function checkOpenbaoDevBootstrapLayout(repoRoot = root) {
  await access(path.join(repoRoot, "deploy/platform/README.md"));
  await access(path.join(repoRoot, "deploy/platform/openbao/values.yaml"));
  const readme = await readFile(path.join(repoRoot, "deploy/platform/README.md"), "utf8");
  if (!readme.includes("key-shares=1")) {
    throw new Error("deploy/platform/README.md must document single-share V1 init");
  }
  if (!readme.includes("openbao-dev-bootstrap.mjs")) {
    throw new Error("deploy/platform/README.md must reference openbao-dev-bootstrap.mjs");
  }
  return { keyShares: 1, keyThreshold: 1, bootstrapSecret: BOOTSTRAP_SECRET };
}

export function printOpenbaoDevBootstrapSteps() {
  return `# INT-133 — V1 OpenBao bootstrap (single unseal key, no Shamir ceremony)
# Context: admin@k8s-intelligent-eu-dev. Never commit tokens or unseal keys.

KUBECONFIG=… node scripts/openbao-dev-bootstrap.mjs --apply

# What --apply does (cluster only):
# 1. bao operator init -key-shares=1 -key-threshold=1
# 2. Stores unseal key + root token in Secret ${NS}/${BOOTSTRAP_SECRET}
# 3. Unseals once
# 4. Enables KV v2 at secret/
# 5. Writes ${ESO_NS}/${ESO_TOKEN_SECRET} for ClusterSecretStore openbao
#
# After pod restart, re-unseal with:
#   kubectl -n ${NS} get secret ${BOOTSTRAP_SECRET} -o jsonpath='{.data.unseal_key}' | base64 -d
#   kubectl -n ${NS} exec ${POD} -- bao operator unseal "$(…)"
`;
}

function statusInitialized() {
  // `bao status` exits 2 when sealed; kubectl may also append a trailer line.
  const result = spawnSync(
    "kubectl",
    ["-n", NS, "exec", POD, "--", "bao", "status", "-format=json"],
    { encoding: "utf8", env: operatorEnv(), maxBuffer: 10 * 1024 * 1024 },
  );
  const raw = `${result.stdout || ""}\n${result.stderr || ""}`;
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < jsonStart) {
    throw new Error(`cannot parse bao status: ${raw.slice(0, 200)}`);
  }
  return JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
}

function ensureBootstrapSecret(initJson) {
  const unseal = initJson.unseal_keys_b64?.[0] ?? initJson.unseal_keys_hex?.[0];
  const root = initJson.root_token;
  if (!unseal || !root) {
    throw new Error("init JSON missing unseal key or root token");
  }
  spawnSync(
    "kubectl",
    ["-n", NS, "delete", "secret", BOOTSTRAP_SECRET, "--ignore-not-found"],
    { encoding: "utf8", env: operatorEnv() },
  );
  kubectl([
    "-n",
    NS,
    "create",
    "secret",
    "generic",
    BOOTSTRAP_SECRET,
    `--from-literal=unseal_key=${unseal}`,
    `--from-literal=root_token=${root}`,
  ]);
  return { unseal, root };
}

function readBootstrapSecret() {
  const unseal = kubectl([
    "-n",
    NS,
    "get",
    "secret",
    BOOTSTRAP_SECRET,
    "-o",
    "jsonpath={.data.unseal_key}",
  ]);
  const root = kubectl([
    "-n",
    NS,
    "get",
    "secret",
    BOOTSTRAP_SECRET,
    "-o",
    "jsonpath={.data.root_token}",
  ]);
  return {
    unseal: Buffer.from(unseal, "base64").toString("utf8"),
    root: Buffer.from(root, "base64").toString("utf8"),
  };
}

function writeEsoToken(rootToken) {
  spawnSync(
    "kubectl",
    ["-n", ESO_NS, "delete", "secret", ESO_TOKEN_SECRET, "--ignore-not-found"],
    { encoding: "utf8", env: operatorEnv() },
  );
  // V1 virtual / Stripe-test only: ESO uses the root token. Tighten later.
  kubectl([
    "-n",
    ESO_NS,
    "create",
    "secret",
    "generic",
    ESO_TOKEN_SECRET,
    `--from-literal=token=${rootToken}`,
  ]);
}

export function applyOpenbaoDevBootstrap() {
  if (!process.env.KUBECONFIG) {
    throw new Error("KUBECONFIG is required for --apply");
  }

  let status = statusInitialized();
  let keys;

  if (!status.initialized) {
    // Single share — no multi-person Shamir ceremony on the V1 virtual cluster.
    const raw = bao([
      "operator",
      "init",
      "-key-shares=1",
      "-key-threshold=1",
      "-format=json",
    ]);
    const initJson = JSON.parse(raw);
    keys = ensureBootstrapSecret(initJson);
  } else {
    keys = readBootstrapSecret();
  }

  status = statusInitialized();
  if (status.sealed) {
    bao(["operator", "unseal", keys.unseal]);
  }

  // Enable KV v2 using the root token in-process (no interactive login).
  const mounts = bao(["secrets", "list", "-format=json"], { token: keys.root });
  if (!/"secret\/"/.test(mounts)) {
    bao(["secrets", "enable", "-path=secret", "kv-v2"], { token: keys.root });
  }

  writeEsoToken(keys.root);

  return {
    initialized: true,
    keyShares: 1,
    bootstrapSecret: `${NS}/${BOOTSTRAP_SECRET}`,
    esoTokenSecret: `${ESO_NS}/${ESO_TOKEN_SECRET}`,
  };
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const args = new Set(process.argv.slice(2));
  if (args.has("--check")) {
    console.log(JSON.stringify(await checkOpenbaoDevBootstrapLayout()));
  } else if (args.has("--print")) {
    process.stdout.write(printOpenbaoDevBootstrapSteps());
  } else if (args.has("--apply")) {
    // Do not print secrets — summary only.
    console.log(JSON.stringify({ applied: true, ...applyOpenbaoDevBootstrap() }));
  } else {
    console.error("Usage: --check | --print | --apply");
    process.exit(2);
  }
}
