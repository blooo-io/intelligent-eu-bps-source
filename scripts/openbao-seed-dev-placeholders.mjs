#!/usr/bin/env node
/**
 * INT-133 — seed OpenBao KV paths so ExternalSecrets can sync on V1 / virtual dev.
 *
 * Writes only non-secret placeholders (`seeded=true`). Real Stripe / webhook values
 * replace these later — never commit real secrets.
 *
 * Usage (after merge; documented operator path — INT-157):
 *   node scripts/openbao-seed-dev-placeholders.mjs --check
 *   node scripts/openbao-seed-dev-placeholders.mjs --print
 *   KUBECONFIG=… node scripts/openbao-seed-dev-placeholders.mjs --apply
 */

import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NS = "openbao";
const POD = "platform-openbao-0";
const BOOTSTRAP_SECRET = "openbao-dev-bootstrap";

/** Paths referenced by ExternalSecret extract keys (module template + nats + debezium + IdP + gateway). */
export const DEV_PLACEHOLDER_PATHS = [
  "dev/web",
  "dev/participants",
  "dev/trade-intake",
  "dev/settlement",
  "dev/invoicing",
  "dev/payments",
  "dev/reconciliation",
  "dev/reporting",
  "dev/publication",
  "dev/notification",
  "dev/compliance",
  "dev/reference-data",
  "dev/scheduler",
  "dev/mocks",
  "dev/cd-smoke",
  "dev/debezium-server",
  "platform/nats/accounts",
  // INT-160 — Keycloak bootstrap admin (property `password`; V1 placeholder only).
  "platform/keycloak",
  // INT-161 — APISIX Admin API keys (properties `admin` / `viewer`; V1 placeholders only).
  "platform/apisix",
];

/** Extra kv pairs per path (default is seeded=true only). Never real Stripe/live secrets. */
export const DEV_PLACEHOLDER_FIELDS = {
  "platform/keycloak": ["password=dev-only-replace-me", "seeded=true"],
  "platform/apisix": [
    "admin=dev-only-replace-me",
    "viewer=dev-only-replace-me",
    // INT-169 — satisfies APISIX openid-connect schema; match Keycloak client secret.
    "oidc_client_secret=dev-only-replace-me",
    "seeded=true",
  ],
};

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
    "jsonpath={.data.root_token}",
  ]);
  return Buffer.from(b64, "base64").toString("utf8");
}

function bao(token, args) {
  return kubectl(["-n", NS, "exec", POD, "--", "env", `BAO_TOKEN=${token}`, "bao", ...args]);
}

export async function checkSeedLayout(repoRoot = root) {
  await access(path.join(repoRoot, "deploy/platform/README.md"));
  const readme = await readFile(path.join(repoRoot, "deploy/platform/README.md"), "utf8");
  if (!readme.includes("openbao-seed-dev-placeholders.mjs")) {
    throw new Error("deploy/platform/README.md must reference openbao-seed-dev-placeholders.mjs");
  }
  const charts = await readdir(path.join(repoRoot, "deploy/charts"));
  for (const name of [
    "web",
    "payments",
    "nats",
    "debezium-server",
    "cd-smoke",
    "keycloak-admin-secret",
    "apisix-admin-secret",
  ]) {
    if (!charts.includes(name)) {
      throw new Error(`expected chart ${name}`);
    }
  }
  return { pathCount: DEV_PLACEHOLDER_PATHS.length };
}

export function printSeedSteps() {
  return `# INT-133 / INT-160 / INT-161 — seed V1 OpenBao KV placeholders (no real secrets)
# Requires prior: node scripts/openbao-dev-bootstrap.mjs --apply
# Run only after this script is on the merged branch (INT-157).

KUBECONFIG=… node scripts/openbao-seed-dev-placeholders.mjs --apply

# Writes keyed paths used by ExternalSecret extract (e.g. secret/data/dev/web)
# with field seeded=true (plus platform/keycloak password and platform/apisix admin/viewer placeholders).
# Replace with Stripe test keys / real Keycloak admin and APISIX Admin API keys later.
`;
}

export function applySeedPlaceholders() {
  if (!process.env.KUBECONFIG) {
    throw new Error("KUBECONFIG is required for --apply");
  }
  const token = rootToken();
  const written = [];
  for (const kvPath of DEV_PLACEHOLDER_PATHS) {
    const fields = DEV_PLACEHOLDER_FIELDS[kvPath] ?? ["seeded=true"];
    bao(token, ["kv", "put", "-mount=secret", kvPath, ...fields]);
    written.push(kvPath);
  }
  return { written: written.length, mount: "secret" };
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const args = process.argv.slice(2);
  if (args.includes("--check")) {
    console.log(JSON.stringify(await checkSeedLayout()));
  } else if (args.includes("--print")) {
    process.stdout.write(printSeedSteps());
  } else if (args.includes("--apply")) {
    console.log(JSON.stringify({ applied: true, ...applySeedPlaceholders() }));
  } else {
    console.error("Usage: --check | --print | --apply");
    process.exit(2);
  }
}
