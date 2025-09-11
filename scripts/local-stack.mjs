#!/usr/bin/env node
/**
 * Local factory stack for TD-12 (INT-136).
 * --check validates the repo wiring (CI-safe, no Docker).
 * --up creates the k3d cluster and applies helmfile -e local (needs Docker + k3d + helmfile).
 * Stripe CLI and Mailpit are documented for the operator; invoice e-mail itself is Stripe-hosted (TD-2).
 */
import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLUSTER = "intelligent-local";
const CONTEXT = `k3d-${CLUSTER}`;

const requiredPaths = [
  "Tiltfile",
  "deploy/envs/local/values.yaml",
  "deploy/charts/mailpit/Chart.yaml",
  "deploy/helmfile/helmfile.yaml",
];

export async function checkLocalStackLayout(base = root) {
  const missing = [];
  for (const relative of requiredPaths) {
    try {
      await access(path.join(base, relative));
    } catch {
      missing.push(relative);
    }
  }
  const helmfile = await readFile(path.join(base, "deploy/helmfile/helmfile.yaml"), "utf8");
  const localValues = await readFile(
    path.join(base, "deploy/envs/local/values.yaml"),
    "utf8",
  );
  const tilt = await readFile(path.join(base, "Tiltfile"), "utf8");
  return {
    missing,
    hasLocalEnvironment: /local:/.test(helmfile),
    hasMailpitRelease: /- name: mailpit/.test(helmfile),
    mailpitEnabled: /mailpit:[\s\S]*enabled:\s*true/.test(localValues),
    tiltUsesLocalHelmfile: /helmfile -e local/.test(tilt),
    stripeCliHint: "stripe listen --forward-to localhost:8080/webhooks/payment-provider",
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}`);
  }
}

function which(binary) {
  const result = spawnSync("sh", ["-c", `command -v ${binary}`], {
    encoding: "utf8",
  });
  return result.status === 0;
}

async function up() {
  for (const binary of ["docker", "k3d", "helm", "helmfile"]) {
    if (!which(binary)) {
      throw new Error(
        `Missing ${binary}. Install it before running the local stack (TD-12).`,
      );
    }
  }
  const existing = spawnSync("k3d", ["cluster", "list", CLUSTER], {
    encoding: "utf8",
  });
  if (existing.status !== 0) {
    run("k3d", [
      "cluster",
      "create",
      CLUSTER,
      "--agents",
      "0",
      "--port",
      "8080:80@loadbalancer",
      "--port",
      "8443:443@loadbalancer",
    ]);
  } else {
    console.log(`k3d cluster ${CLUSTER} already exists`);
  }
  run("kubectl", ["config", "use-context", CONTEXT]);
  run("helmfile", ["-e", "local", "-f", "deploy/helmfile/helmfile.yaml", "apply"]);
  console.log(`
Local stack applied (TD-12).
- kubectl context: ${CONTEXT}
- Mailpit UI: kubectl -n local-apps port-forward svc/mailpit 8025:8025
- Stripe CLI (REQ-017 path): stripe listen --forward-to localhost:8080/webhooks/payment-provider
- Tilt: tilt up
`);
}

const mode = process.argv[2] ?? "--check";
if (process.argv[1]?.endsWith("local-stack.mjs")) {
  if (mode === "--check") {
    const report = await checkLocalStackLayout();
    if (report.missing.length > 0) {
      console.error("Missing local-stack files:", report.missing.join(", "));
      process.exit(1);
    }
    if (
      !report.hasLocalEnvironment ||
      !report.hasMailpitRelease ||
      !report.mailpitEnabled ||
      !report.tiltUsesLocalHelmfile
    ) {
      console.error("Local stack wiring incomplete:", report);
      process.exit(1);
    }
    console.log("Local stack layout OK (INT-136 / TD-12).");
    console.log(`Stripe CLI hint: ${report.stripeCliHint}`);
  } else if (mode === "--up") {
    await up();
  } else {
    console.error("Usage: node scripts/local-stack.mjs [--check|--up]");
    process.exit(1);
  }
}
