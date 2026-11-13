#!/usr/bin/env node
/**
 * INT-177 — seed OpenBao platform/ghcr-pull with a GHCR dockerconfigjson.
 *
 * Never commit the token. Operator / cloud agent:
 *   GHCR_PULL_TOKEN=ghp_… KUBECONFIG=… node scripts/openbao-seed-ghcr-pull.mjs --apply
 *
 * Token needs read:packages on blooo-io container packages for this repo.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { operatorEnv } from "./lib/operator-env.mjs";

const NS = "openbao";

const POD = "platform-openbao-0";
const BOOTSTRAP_SECRET = "openbao-dev-bootstrap";
const PATH_KEY = "platform/ghcr-pull";

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
  // Key matches openbao-dev-bootstrap.mjs / openbao-seed-dev-placeholders.mjs (root_token).
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

export function buildDockerConfigJson(username, token) {
  const auth = Buffer.from(`${username}:${token}`, "utf8").toString("base64");
  return JSON.stringify({
    auths: {
      "ghcr.io": {
        username,
        password: token,
        auth,
      },
    },
  });
}

function bao(token, args) {
  // Same pattern as openbao-seed-dev-placeholders: pass BAO_TOKEN via env, not shell quoting.
  return kubectl(["-n", NS, "exec", POD, "--", "env", `BAO_TOKEN=${token}`, "bao", ...args]);
}

function apply(username, token) {
  const dockerconfigjson = buildDockerConfigJson(username, token);
  const baoToken = rootToken();
  if (!baoToken) {
    throw new Error(`empty root token from ${NS}/${BOOTSTRAP_SECRET} key root_token`);
  }
  // KV path already referenced by ExternalSecret ghcr-pull (ClusterSecretStore openbao).
  bao(baoToken, ["kv", "put", `secret/${PATH_KEY}`, `dockerconfigjson=${dockerconfigjson}`]);
  return { path: PATH_KEY, username };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? "--check";
  if (mode === "--check") {
    console.log(
      JSON.stringify({
        path: PATH_KEY,
        needs: ["GHCR_PULL_TOKEN", "KUBECONFIG"],
        apply:
          "GHCR_PULL_TOKEN=… KUBECONFIG=… node scripts/openbao-seed-ghcr-pull.mjs --apply",
      }),
    );
    process.exit(0);
  }
  if (mode === "--print") {
    console.log(`# Seed GHCR pull credentials into OpenBao (${PATH_KEY})`);
    console.log(
      "GHCR_PULL_TOKEN=ghp_… GHCR_PULL_USERNAME=x-access-token KUBECONFIG=… \\",
    );
    console.log("  node scripts/openbao-seed-ghcr-pull.mjs --apply");
    process.exit(0);
  }
  if (mode === "--apply") {
    const token = process.env.GHCR_PULL_TOKEN;
    if (!token) {
      console.error("GHCR_PULL_TOKEN is required");
      process.exit(1);
    }
    const username = process.env.GHCR_PULL_USERNAME || "x-access-token";
    const result = apply(username, token);
    console.log(JSON.stringify({ path: result.path, status: "ok" }));
    process.exit(0);
  }
  console.error("usage: --check | --print | --apply");
  process.exit(1);
}
