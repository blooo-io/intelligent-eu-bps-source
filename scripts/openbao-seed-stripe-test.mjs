#!/usr/bin/env node
/**
 * INT-186 — seed OpenBao with Stripe **test** credentials for AC-07 / AC-06.
 *
 * Never commit secret values. Operator / cloud agent (after merge — INT-157):
 *   STRIPE_SECRET_KEY=sk_test_… \
 *   STRIPE_WEBHOOK_SECRET=whsec_… \
 *   STRIPE_CONNECT_WEBHOOK_SECRET=whsec_… \   # optional Connect endpoint secret
 *   KUBECONFIG=… node scripts/openbao-seed-stripe-test.mjs --apply
 *
 * Writes KV paths referenced by ExternalSecret extract:
 *   secret/dev/payments
 *   secret/dev/invoicing
 */

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NS = "openbao";
const POD = "platform-openbao-0";
const BOOTSTRAP_SECRET = "openbao-dev-bootstrap";

export const STRIPE_SEED_PATHS = ["dev/payments", "dev/invoicing"];

export const STRIPE_SEED_FIELD_NAMES = [
  "stripe_secret_key",
  "stripe_webhook_secret",
  "stripe_connect_webhook_secret",
  "seeded",
];

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

/** Build kv put field args; never log values. */
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
  return { paths: STRIPE_SEED_PATHS.length, fields: STRIPE_SEED_FIELD_NAMES.length };
}

export function printStripeSeedSteps() {
  return `# INT-186 — seed Stripe test credentials into OpenBao (dev)
# Requires prior: openbao-dev-bootstrap + openbao-seed-dev-placeholders (or equivalent paths).
# Run only after this script is on the merged branch (INT-157). Never commit env values.

STRIPE_SECRET_KEY=sk_test_… \\
STRIPE_WEBHOOK_SECRET=whsec_… \\
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_… \\
KUBECONFIG=… node scripts/openbao-seed-stripe-test.mjs --apply

# Writes secret/dev/payments and secret/dev/invoicing (ExternalSecret extract → K8s Secrets).
`;
}

export function applyStripeSeed(env = process.env) {
  if (!env.KUBECONFIG) {
    throw new Error("KUBECONFIG is required for --apply");
  }
  const fields = buildStripeKvFields({
    stripeSecretKey: env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
    stripeConnectWebhookSecret: env.STRIPE_CONNECT_WEBHOOK_SECRET,
  });
  const token = rootToken();
  if (!token) {
    throw new Error(`empty root token from ${NS}/${BOOTSTRAP_SECRET} key root_token`);
  }
  const written = [];
  for (const kvPath of STRIPE_SEED_PATHS) {
    bao(token, ["kv", "put", "-mount=secret", kvPath, ...fields]);
    written.push(kvPath);
  }
  return { written, mount: "secret", fieldNames: STRIPE_SEED_FIELD_NAMES.filter((n) => n !== "stripe_connect_webhook_secret" || Boolean(env.STRIPE_CONNECT_WEBHOOK_SECRET)) };
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const args = process.argv.slice(2);
  if (args.includes("--check")) {
    console.log(JSON.stringify(await checkStripeSeedLayout()));
  } else if (args.includes("--print")) {
    process.stdout.write(printStripeSeedSteps());
  } else if (args.includes("--apply")) {
    console.log(JSON.stringify({ applied: true, ...applyStripeSeed() }));
  } else {
    console.error("Usage: --check | --print | --apply");
    process.exit(2);
  }
}
