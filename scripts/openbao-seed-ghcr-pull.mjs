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

const NS = "openbao";

const POD = "platform-openbao-0";
const BOOTSTRAP_SECRET = "openbao-dev-bootstrap";
const PATH_KEY = "platform/ghcr-pull";

function kubectl(args) {
  const result = spawnSync("kubectl", args, {
    encoding: "utf8",
    env: process.env,
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
    "jsonpath={.data.root-token}",
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

function apply(username, token) {
  const dockerconfigjson = buildDockerConfigJson(username, token);
  const baoToken = rootToken();
  // Write via bao CLI in the pod (path already used by ESO ClusterSecretStore).
  const script = [
    `export BAO_TOKEN='${baoToken.replace(/'/g, `'\"'\"'`)}'`,
    "export BAO_ADDR=http://127.0.0.1:8200",
    `bao kv put secret/${PATH_KEY} dockerconfigjson='${dockerconfigjson.replace(/'/g, `'\"'\"'`)}'`,
  ].join(" && ");
  kubectl(["-n", NS, "exec", POD, "--", "sh", "-c", script]);
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
    console.log(JSON.stringify(apply(username, token)));
    process.exit(0);
  }
  console.error("usage: --check | --print | --apply");
  process.exit(1);
}
