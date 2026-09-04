#!/usr/bin/env node
// INT-155 / TD-11 — validate Argo bootstrap packaging and print operator steps.
// Does not talk to the cluster (no KUBECONFIG on CI agents).

import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_CONTEXT = "admin@k8s-intelligent-eu-dev";
// argo-helm release tag argo-cd-8.5.8 (Apache-2.0 chart).
const ARGO_CHART_VERSION = "8.5.8";

export async function checkBootstrapLayout(repoRoot = root) {
  const required = [
    "deploy/argocd/README.md",
    "deploy/argocd/bootstrap/values.yaml",
    "deploy/argocd/dev",
    "deploy/argocd/demo",
  ];
  for (const relative of required) {
    await access(path.join(repoRoot, relative));
  }

  const values = await readFile(
    path.join(repoRoot, "deploy/argocd/bootstrap/values.yaml"),
    "utf8",
  );
  const hasEmbeddedSecretKind = values.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    return trimmed.startsWith("kind:") && trimmed.slice("kind:".length).trim() === "Secret";
  });
  if (values.includes("stringData:") || hasEmbeddedSecretKind) {
    throw new Error("bootstrap values must not embed Kubernetes Secret data");
  }
  if (!values.includes("server.insecure: true")) {
    throw new Error("bootstrap values must set server.insecure for port-forward bootstrap");
  }

  const devApps = (await readdir(path.join(repoRoot, "deploy/argocd/dev"))).filter((n) =>
    n.endsWith(".yaml"),
  );
  if (devApps.length === 0) {
    throw new Error("deploy/argocd/dev must contain Application manifests");
  }

  return {
    expectedContext: EXPECTED_CONTEXT,
    argoChartVersion: ARGO_CHART_VERSION,
    devApplicationCount: devApps.length,
  };
}

export function printOperatorSteps({ argoChartVersion = ARGO_CHART_VERSION } = {}) {
  return `# INT-155 Argo CD bootstrap — run on the operator laptop
# Expected: kubectl config current-context → ${EXPECTED_CONTEXT}

kubectl config current-context

helm repo add argo https://argoproj.github.io/argo-helm
helm repo update
helm upgrade --install argocd argo/argo-cd \\
  --namespace argocd \\
  --create-namespace \\
  --version ${argoChartVersion} \\
  -f deploy/argocd/bootstrap/values.yaml \\
  --wait

# Repository credentials (private GitHub) — token never committed
node scripts/argocd-repo-credentials.mjs --print
# ARGOCD_GITHUB_TOKEN=… KUBECONFIG=… node scripts/argocd-repo-credentials.mjs --apply

kubectl apply -f deploy/argocd/dev/
kubectl apply -f deploy/argocd/platform/

kubectl -n argocd get secret argocd-initial-admin-secret \\
  -o jsonpath='{.data.password}' | base64 -d; echo
kubectl -n argocd port-forward svc/argocd-server 8080:443
`;
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const args = process.argv.slice(2);
  if (args.includes("--check")) {
    const summary = await checkBootstrapLayout();
    console.log(
      `Argo bootstrap layout OK (${summary.devApplicationCount} dev Applications; context ${summary.expectedContext}).`,
    );
  }
  if (args.includes("--print")) {
    process.stdout.write(printOperatorSteps());
  }
  if (!args.includes("--check") && !args.includes("--print")) {
    console.error("Usage: node scripts/argocd-bootstrap.mjs --check | --print");
    process.exit(1);
  }
}
