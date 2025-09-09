import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkBootstrapLayout, printOperatorSteps } from "./argocd-bootstrap.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("argocd bootstrap layout is present and secret-free (INT-155)", async () => {
  const summary = await checkBootstrapLayout(root);
  assert.equal(summary.expectedContext, "admin@k8s-intelligent-eu-dev");
  assert.ok(summary.devApplicationCount >= 1);
  assert.match(summary.argoChartVersion, /^\d+\.\d+\.\d+$/);
});

test("printed operator steps use the documented context and chart pin", () => {
  const text = printOperatorSteps();
  assert.match(text, /admin@k8s-intelligent-eu-dev/);
  assert.match(text, /argo\/argo-cd/);
  assert.match(text, /deploy\/argocd\/bootstrap\/values\.yaml/);
  assert.match(text, /kubectl apply -f deploy\/argocd\/dev\//);
  assert.equal(text.includes("stringData:"), false);
});

test("README documents local kubeconfig and never-commit rule", async () => {
  const text = await readFile(path.join(root, "deploy/argocd/README.md"), "utf8");
  assert.match(text, /admin@k8s-intelligent-eu-dev/);
  assert.match(text, /Never commit a kubeconfig/);
  assert.match(text, /port-forward/);
  assert.match(text, /KUBECONFIG_INTELLIGENT_EU_DEV/);
});

test("argocd-bootstrap workflow is dispatch-only and uses the dev environment secret", async () => {
  const text = await readFile(
    path.join(root, ".github/workflows/argocd-bootstrap.yml"),
    "utf8",
  );
  assert.match(text, /workflow_dispatch:/);
  assert.match(text, /environment:\s*dev/);
  assert.match(text, /secrets\.KUBECONFIG_INTELLIGENT_EU_DEV/);
  assert.match(text, /admin@k8s-intelligent-eu-dev/);
  assert.equal(text.includes("stringData:"), false);
  // Must not auto-run on push/PR — bootstrap is intentional only.
  assert.equal(/\n\s+push:/.test(text), false);
  assert.equal(text.includes("pull_request:"), false);
});
