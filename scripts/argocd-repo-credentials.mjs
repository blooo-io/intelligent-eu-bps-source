#!/usr/bin/env node
/**
 * INT-155 — package Argo CD Git repository credentials (no secret values in Git).
 *
 * Private GitHub repo requires an Argo repository Secret so Applications can
 * clone. The token lives only in the environment (GHA / operator shell / vault).
 *
 * Usage:
 *   node scripts/argocd-repo-credentials.mjs --check   # CI layout
 *   node scripts/argocd-repo-credentials.mjs --print   # operator steps (no token echo)
 *   ARGOCD_GITHUB_TOKEN=… KUBECONFIG=… node scripts/argocd-repo-credentials.mjs --apply
 */

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_URL = "https://github.com/blooo-io/intelligent-eu-billing-and-payment.git";
const SECRET_NAME = "repo-intelligent-eu-billing-and-payment";
const SECRET_NAMESPACE = "argocd";

export async function checkRepoCredentialLayout(repoRoot = root) {
  await access(path.join(repoRoot, "deploy/argocd/README.md"));
  await access(path.join(repoRoot, ".github/workflows/argocd-bootstrap.yml"));
  const readme = await readFile(path.join(repoRoot, "deploy/argocd/README.md"), "utf8");
  if (!readme.includes("ARGOCD_GITHUB_TOKEN")) {
    throw new Error("deploy/argocd/README.md must document ARGOCD_GITHUB_TOKEN");
  }
  if (!readme.includes(SECRET_NAME)) {
    throw new Error(`deploy/argocd/README.md must name Secret ${SECRET_NAME}`);
  }
  return { secretName: SECRET_NAME, repoUrl: REPO_URL, namespace: SECRET_NAMESPACE };
}

export function printRepoCredentialSteps() {
  return `# INT-155 — Argo CD repository credentials (read-only GitHub PAT)
# Required so Applications can clone the private repo.
# Never commit the token. Prefer a fine-grained PAT: contents:read on this repo only.
#
# Export the token, then either --apply with KUBECONFIG set, or run:

export ARGOCD_GITHUB_TOKEN=…   # from password manager / env secret / GHA env secret

kubectl -n ${SECRET_NAMESPACE} delete secret ${SECRET_NAME} --ignore-not-found
kubectl -n ${SECRET_NAMESPACE} create secret generic ${SECRET_NAME} \\
  --from-literal=type=git \\
  --from-literal=url=${REPO_URL} \\
  --from-literal=username=x-access-token \\
  --from-literal=password="\${ARGOCD_GITHUB_TOKEN}"
kubectl -n ${SECRET_NAMESPACE} label secret ${SECRET_NAME} \\
  argocd.argoproj.io/secret-type=repository --overwrite

# Hard-refresh apps so they pick up the credential:
# kubectl -n argocd annotate application --all argocd.argoproj.io/refresh=hard --overwrite
`;
}

export function applyRepoCredential({
  token = process.env.ARGOCD_GITHUB_TOKEN,
  kubeconfig = process.env.KUBECONFIG,
} = {}) {
  if (!token || !String(token).trim()) {
    throw new Error("ARGOCD_GITHUB_TOKEN is required for --apply");
  }
  if (!kubeconfig) {
    throw new Error("KUBECONFIG is required for --apply");
  }

  const env = { ...process.env, KUBECONFIG: kubeconfig };
  // Delete then create — avoids echoing secret on patch.
  spawnSync(
    "kubectl",
    ["-n", SECRET_NAMESPACE, "delete", "secret", SECRET_NAME, "--ignore-not-found"],
    { env, stdio: "inherit" },
  );
  const create = spawnSync(
    "kubectl",
    [
      "-n",
      SECRET_NAMESPACE,
      "create",
      "secret",
      "generic",
      SECRET_NAME,
      "--from-literal=type=git",
      `--from-literal=url=${REPO_URL}`,
      "--from-literal=username=x-access-token",
      `--from-literal=password=${token}`,
    ],
    { env, stdio: "inherit" },
  );
  if (create.status !== 0) {
    throw new Error("kubectl create secret failed");
  }
  const label = spawnSync(
    "kubectl",
    [
      "-n",
      SECRET_NAMESPACE,
      "label",
      "secret",
      SECRET_NAME,
      "argocd.argoproj.io/secret-type=repository",
      "--overwrite",
    ],
    { env, stdio: "inherit" },
  );
  if (label.status !== 0) {
    throw new Error("kubectl label secret failed");
  }
  return { secretName: SECRET_NAME, namespace: SECRET_NAMESPACE };
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const args = process.argv.slice(2);
  if (args.includes("--check")) {
    const summary = await checkRepoCredentialLayout();
    console.log(JSON.stringify(summary));
  } else if (args.includes("--print")) {
    process.stdout.write(printRepoCredentialSteps());
  } else if (args.includes("--apply")) {
    const summary = applyRepoCredential();
    console.log(JSON.stringify({ applied: true, ...summary }));
  } else {
    console.error("Usage: --check | --print | --apply");
    process.exit(2);
  }
}
