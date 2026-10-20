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
import { operatorEnv } from "./lib/operator-env.mjs";

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
  // INT-292 — SonarQube monitoringPasscode (property `monitoring_passcode`; V1 placeholder only).
  "platform/sonarqube",
  // INT-308 — DDHub Client Gateway DB password + Vault token (V1 placeholders only).
  "platform/ddhub",
];

/**
 * INT-287 — Nest modules that mint/validate service JWTs.
 * Matches Keycloak `module-service` client secret in int/demo realm JSON.
 */
export const MODULE_SERVICE_JWT_PATHS = [
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
];

const MODULE_SERVICE_JWT_FIELDS = [
  "KEYCLOAK_SERVICE_CLIENT_SECRET=dev-module-service-replace-me",
  "seeded=true",
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
  "platform/sonarqube": [
    "monitoring_passcode=dev-only-replace-me",
    // INT-293 — replaced by sonarqube-bootstrap.mjs with a generated password on --apply.
    "admin_password=dev-only-replace-me",
    "seeded=true",
  ],
  "platform/ddhub": [
    // INT-308 — CG Vault token only (DB password comes from CNPG/ESO generator).
    "vault_token=dev-only-replace-me",
    "seeded=true",
  ],
  ...Object.fromEntries(
    MODULE_SERVICE_JWT_PATHS.map((p) => [p, MODULE_SERVICE_JWT_FIELDS]),
  ),
};

/**
 * Paths that hold Stripe test credentials (INT-186 / INT-191).
 * Placeholder apply must not wipe them with a bare `seeded=true` put (INT-295).
 */
export const STRIPE_PROTECTED_PATHS = ["dev/payments", "dev/invoicing", "dev/web"];

/** True when OpenBao already holds a non-placeholder Stripe field. */
export function hasRealStripeCredentials(data = {}) {
  return Object.entries(data).some(([key, value]) => {
    if (!key.startsWith("stripe_")) return false;
    const text = String(value ?? "");
    if (!text || text === "dev-only-replace-me") return false;
    if (text.includes("REPLACE") || text.includes("replace-me")) return false;
    return (
      text.startsWith("sk_test_") ||
      text.startsWith("pk_test_") ||
      text.startsWith("whsec_")
    );
  });
}

export function parseFieldArgs(fieldArgs) {
  return Object.fromEntries(
    fieldArgs.map((entry) => {
      const idx = entry.indexOf("=");
      return [entry.slice(0, idx), entry.slice(idx + 1)];
    }),
  );
}

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

function readKvMap(token, kvPath) {
  try {
    const raw = bao(token, [
      "kv",
      "get",
      "-mount=secret",
      "-format=json",
      kvPath,
    ]);
    return JSON.parse(raw)?.data?.data ?? {};
  } catch {
    return {};
  }
}

export function applySeedPlaceholders() {
  if (!process.env.KUBECONFIG) {
    throw new Error("KUBECONFIG is required for --apply");
  }
  const token = rootToken();
  const written = [];
  const skipped = [];
  for (const kvPath of DEV_PLACEHOLDER_PATHS) {
    const existing = readKvMap(token, kvPath);
    // INT-295 — bare `kv put seeded=true` replaced Stripe test keys and crashed
    // invoicing/payments on e2e rollout (`requires stripe_secret_key`).
    if (
      STRIPE_PROTECTED_PATHS.includes(kvPath) &&
      hasRealStripeCredentials(existing)
    ) {
      skipped.push(kvPath);
      continue;
    }
    const fields = DEV_PLACEHOLDER_FIELDS[kvPath] ?? ["seeded=true"];
    // Merge for platform paths so bootstrap-generated admin_password survives.
    const patch = parseFieldArgs(fields);
    const merged = { ...existing };
    for (const [key, value] of Object.entries(patch)) {
      const current = merged[key];
      if (
        current &&
        current !== "dev-only-replace-me" &&
        (key === "admin_password" || key === "analysis_token" || key.startsWith("stripe_"))
      ) {
        continue;
      }
      merged[key] = value;
    }
    const putFields = Object.entries(merged).map(([k, v]) => `${k}=${v}`);
    bao(token, ["kv", "put", "-mount=secret", kvPath, ...putFields]);
    written.push(kvPath);
  }
  return { written: written.length, skipped: skipped.length, mount: "secret" };
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const args = new Set(process.argv.slice(2));
  if (args.has("--check")) {
    console.log(JSON.stringify(await checkSeedLayout()));
  } else if (args.has("--print")) {
    process.stdout.write(printSeedSteps());
  } else if (args.has("--apply")) {
    console.log(JSON.stringify({ applied: true, ...applySeedPlaceholders() }));
  } else {
    console.error("Usage: --check | --print | --apply");
    process.exit(2);
  }
}
