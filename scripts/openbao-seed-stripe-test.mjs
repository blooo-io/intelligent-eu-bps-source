#!/usr/bin/env node
/**
 * INT-186 / INT-191 — seed OpenBao with Stripe **test** credentials for AC-07 / AC-06 / AC-01.
 *
 * Never commit secret values. Operator / cloud agent (after merge — INT-157):
 *   STRIPE_SECRET_KEY=sk_test_… \
 *   STRIPE_PUBLISHABLE_KEY=pk_test_… \
 *   STRIPE_WEBHOOK_SECRET=whsec_… \
 *   STRIPE_CONNECT_WEBHOOK_SECRET=whsec_… \   # optional Connect endpoint secret
 *   KUBECONFIG=… node scripts/openbao-seed-stripe-test.mjs --apply
 *
 * Writes KV paths referenced by ExternalSecret extract:
 *   secret/dev/payments
 *   secret/dev/invoicing
 *   secret/dev/web          (publishable key only — INT-191 Account Tokens)
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

export const STRIPE_SEED_PATHS = ["dev/payments", "dev/invoicing"];
export const STRIPE_WEB_SEED_PATH = "dev/web";

export const STRIPE_SEED_FIELD_NAMES = [
  "stripe_secret_key",
  "stripe_webhook_secret",
  "stripe_connect_webhook_secret",
  "stripe_publishable_key",
  "seeded",
];

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

/** Build kv put field args for payments/invoicing; never log values. */
export function buildStripeKvFields(input) {
  const secretKey = input.stripeSecretKey?.trim() ?? "";
  const webhookSecret = input.stripeWebhookSecret?.trim() ?? "";
  const connectWebhookSecret = input.stripeConnectWebhookSecret?.trim() ?? "";

  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("STRIPE_SECRET_KEY must be a Stripe test secret key (sk_test_…)");
  }
  if (!webhookSecret.startsWith("whsec_")) {
    throw new Error("STRIPE_WEBHOOK_SECRET must start with whsec_");
  }
  if (connectWebhookSecret && !connectWebhookSecret.startsWith("whsec_")) {
    throw new Error("STRIPE_CONNECT_WEBHOOK_SECRET must start with whsec_ when set");
  }

  const fields = [
    `stripe_secret_key=${secretKey}`,
    `stripe_webhook_secret=${webhookSecret}`,
    "seeded=true",
  ];
  if (connectWebhookSecret) {
    fields.push(`stripe_connect_webhook_secret=${connectWebhookSecret}`);
  }
  return fields;
}

/** Build kv put field args for web publishable key (INT-191). */
export function buildStripeWebKvFields(input) {
  const publishableKey = input.stripePublishableKey?.trim() ?? "";
  if (!publishableKey.startsWith("pk_test_")) {
    throw new Error(
      "STRIPE_PUBLISHABLE_KEY must be a Stripe test publishable key (pk_test_…)",
    );
  }
  return [`stripe_publishable_key=${publishableKey}`, "seeded=true"];
}

export async function checkStripeSeedLayout(repoRoot = root) {
  await access(path.join(repoRoot, "deploy/platform/README.md"));
  const readme = await readFile(path.join(repoRoot, "deploy/platform/README.md"), "utf8");
  if (!readme.includes("openbao-seed-stripe-test.mjs")) {
    throw new Error("deploy/platform/README.md must reference openbao-seed-stripe-test.mjs");
  }
  const source = await readFile(path.join(repoRoot, "scripts/openbao-seed-stripe-test.mjs"), "utf8");
  if (!source.includes("jsonpath={.data.root_token}")) {
    throw new Error("seed script must read bootstrap root_token");
  }
  if (!source.includes("stripe_publishable_key")) {
    throw new Error("seed script must write stripe_publishable_key for INT-191");
  }
  return { paths: STRIPE_SEED_PATHS.length + 1, fields: STRIPE_SEED_FIELD_NAMES.length };
}

export function printStripeSeedSteps() {
  return String.raw`# INT-186 / INT-191 — seed Stripe test credentials into OpenBao (dev)
# Requires prior: openbao-dev-bootstrap + openbao-seed-dev-placeholders (or equivalent paths).
# Run only after this script is on the merged branch (INT-157). Never commit env values.

STRIPE_SECRET_KEY=sk_test_… \
STRIPE_PUBLISHABLE_KEY=pk_test_… \
STRIPE_WEBHOOK_SECRET=whsec_… \
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_… \
KUBECONFIG=… node scripts/openbao-seed-stripe-test.mjs --apply

# Writes secret/dev/payments and secret/dev/invoicing (secret + webhook).
# Writes secret/dev/web (stripe_publishable_key for AC-01 Account Tokens).
`;
}

/** Apps namespace where ExternalSecrets `payments` / `invoicing` / `web` live (dev). */
export const ESO_NAMESPACE = "int-apps";

/** Force ESO to re-read OpenBao immediately (refreshInterval is otherwise 1h). */
export function forceExternalSecretSync(
  secretNames = ["payments", "invoicing", "web"],
  ns = ESO_NAMESPACE,
) {
  const stamp = String(Math.floor(Date.now() / 1000));
  kubectl([
    "-n",
    ns,
    "annotate",
    "externalsecret",
    ...secretNames,
    `force-sync=${stamp}`,
    "--overwrite",
  ]);
  return { namespace: ns, secrets: secretNames, forceSync: stamp };
}

export function applyStripeSeed(env = process.env) {
  if (!env.KUBECONFIG) {
    throw new Error("KUBECONFIG is required for --apply");
  }
  const secretFields = buildStripeKvFields({
    stripeSecretKey: env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
    stripeConnectWebhookSecret: env.STRIPE_CONNECT_WEBHOOK_SECRET,
  });
  const webFields = buildStripeWebKvFields({
    stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY,
  });
  const token = rootToken();
  if (!token) {
    throw new Error(`empty root token from ${NS}/${BOOTSTRAP_SECRET} key root_token`);
  }
  const written = [];
  for (const kvPath of STRIPE_SEED_PATHS) {
    bao(token, ["kv", "put", "-mount=secret", kvPath, ...secretFields]);
    written.push(kvPath);
  }
  bao(token, ["kv", "put", "-mount=secret", STRIPE_WEB_SEED_PATH, ...webFields]);
  written.push(STRIPE_WEB_SEED_PATH);
  const eso = forceExternalSecretSync();
  return {
    written,
    mount: "secret",
    fieldNames: STRIPE_SEED_FIELD_NAMES.filter(
      (n) => n !== "stripe_connect_webhook_secret" || Boolean(env.STRIPE_CONNECT_WEBHOOK_SECRET),
    ),
    eso,
  };
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const args = new Set(process.argv.slice(2));
  if (args.has("--check")) {
    console.log(JSON.stringify(await checkStripeSeedLayout()));
  } else if (args.has("--print")) {
    process.stdout.write(printStripeSeedSteps());
  } else if (args.has("--apply")) {
    console.log(JSON.stringify({ applied: true, ...applyStripeSeed() }));
  } else {
    console.error("Usage: --check | --print | --apply");
    process.exit(2);
  }
}
