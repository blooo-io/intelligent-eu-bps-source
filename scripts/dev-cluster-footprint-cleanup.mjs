#!/usr/bin/env node
/**
 * INT-331 — documented operator cleanup for V1 / virtual `dev` memory footprint.
 *
 * Removes leftovers that GitOps cannot prune (not in `develop`):
 * 1. Orphan CNPG Cluster `default/int-data` (superseded by `int-data/int-data`;
 *    apps use `int-data-rw.int-data.svc.cluster.local`).
 * 2. Unused `demo-*` Argo CD Applications registered on this cluster (bootstrap
 *    only applies `dev/` + `platform/`; demo apps still cost controller memory).
 *
 * Usage (INT-157 — apply only after merge on develop):
 *   node scripts/dev-cluster-footprint-cleanup.mjs --check
 *   node scripts/dev-cluster-footprint-cleanup.mjs --print
 *   KUBECONFIG=… node scripts/dev-cluster-footprint-cleanup.mjs --apply
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { operatorEnv } from "./lib/operator-env.mjs";

const EXPECTED_CONTEXT = "admin@k8s-intelligent-eu-dev";
const ORPHAN_CLUSTER_NS = "default";
const ORPHAN_CLUSTER_NAME = "int-data";
const LIVE_DB_HOST_SNIPPET = "int-data-rw.int-data.svc";

export function printOperatorSteps() {
  return String.raw`# INT-331 — V1/dev cluster footprint cleanup (operator laptop)
# Expected: kubectl config current-context → ${EXPECTED_CONTEXT}

kubectl config current-context

# 1) Orphan CNPG Cluster left in default/ after the move to namespace int-data.
#    Safe only when no Pod env still points at int-data*.default.svc.
kubectl get cluster.postgresql.cnpg.io ${ORPHAN_CLUSTER_NAME} -n ${ORPHAN_CLUSTER_NS} || true
kubectl get pods -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{"|"}{range .spec.containers[*]}{range .env[*]}{.name}={" "}{.value}{";"}{end}{end}{"\n"}{end}' \
  | grep -E 'int-data[^/|;]*\.default\.svc' || true
# If the grep prints nothing, delete the orphan:
kubectl delete cluster.postgresql.cnpg.io ${ORPHAN_CLUSTER_NAME} -n ${ORPHAN_CLUSTER_NS} --wait=true

# 2) Drop unused demo Argo Applications (not applied by INT-155 bootstrap print).
for app in $(kubectl get applications.argoproj.io -n argocd -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' | grep '^demo-'); do
  kubectl delete application.argoproj.io "$app" -n argocd --wait=false
done

kubectl top nodes
`;
}

function kubectl(args, { check = true, maxBuffer = 20 * 1024 * 1024 } = {}) {
  const result = spawnSync("kubectl", args, {
    encoding: "utf8",
    env: operatorEnv(),
    maxBuffer,
  });
  if (check && result.status !== 0) {
    const err = (result.stderr || result.stdout || result.error?.message || "").trim();
    throw new Error(
      `kubectl ${args.join(" ")} failed: ${err.slice(0, 500)}`,
    );
  }
  return result;
}

function currentContext() {
  const result = kubectl(["config", "current-context"]);
  return (result.stdout || "").trim();
}

/**
 * @returns {{ orphanClusterPresent: boolean, demoApplications: string[] }}
 */
export function inspectFootprintLeftovers() {
  const ctx = currentContext();
  if (ctx !== EXPECTED_CONTEXT) {
    throw new Error(
      `expected kubectl context ${EXPECTED_CONTEXT}, got ${ctx || "(empty)"}`,
    );
  }

  const cluster = kubectl(
    [
      "get",
      "cluster.postgresql.cnpg.io",
      ORPHAN_CLUSTER_NAME,
      "-n",
      ORPHAN_CLUSTER_NS,
      "-o",
      "name",
    ],
    { check: false },
  );
  const orphanClusterPresent = cluster.status === 0;

  const apps = kubectl([
    "get",
    "applications.argoproj.io",
    "-n",
    "argocd",
    "-o",
    "jsonpath={range .items[*]}{.metadata.name}{\"\\n\"}{end}",
  ]);
  const demoApplications = (apps.stdout || "")
    .split("\n")
    .map((s) => s.trim())
    .filter((name) => name.startsWith("demo-"));

  return { orphanClusterPresent, demoApplications };
}

/**
 * Refuse to delete default/int-data if any live env still targets *.default.svc.
 * Uses jsonpath (not full pod JSON) so large clusters stay under spawn buffers.
 */
function assertNoDefaultIntDataConsumers() {
  const pods = kubectl([
    "get",
    "pods",
    "-A",
    "-o",
    'jsonpath={range .items[*]}{.metadata.namespace}/{.metadata.name}{"|"}{range .spec.containers[*]}{range .env[*]}{.name}={" "}{.value}{";"}{end}{end}{"\\n"}{end}',
  ]);
  const hits = [];
  for (const line of (pods.stdout || "").split("\n")) {
    if (!line.includes(".default.svc")) continue;
    if (!/int-data[^/\s|;]*\.default\.svc/.test(line)) continue;
    hits.push(line.slice(0, 300));
  }
  if (hits.length > 0) {
    throw new Error(
      `refusing to delete ${ORPHAN_CLUSTER_NS}/${ORPHAN_CLUSTER_NAME}; consumers still use default.svc:\n${hits.join("\n")}`,
    );
  }
}

export function applyFootprintCleanup() {
  const before = inspectFootprintLeftovers();
  const actions = [];

  if (before.orphanClusterPresent) {
    assertNoDefaultIntDataConsumers();
    kubectl([
      "delete",
      "cluster.postgresql.cnpg.io",
      ORPHAN_CLUSTER_NAME,
      "-n",
      ORPHAN_CLUSTER_NS,
      "--wait=true",
    ]);
    actions.push(`deleted cluster ${ORPHAN_CLUSTER_NS}/${ORPHAN_CLUSTER_NAME}`);
  } else {
    actions.push(`orphan cluster ${ORPHAN_CLUSTER_NS}/${ORPHAN_CLUSTER_NAME} already absent`);
  }

  for (const name of before.demoApplications) {
    kubectl(
      ["delete", "application.argoproj.io", name, "-n", "argocd", "--wait=false"],
      { check: false },
    );
    actions.push(`deleted Argo Application ${name}`);
  }
  if (before.demoApplications.length === 0) {
    actions.push("no demo-* Argo Applications present");
  }

  return {
    liveDbHostSnippet: LIVE_DB_HOST_SNIPPET,
    actions,
    before,
  };
}

export function checkScriptLayout() {
  return {
    expectedContext: EXPECTED_CONTEXT,
    orphanCluster: `${ORPHAN_CLUSTER_NS}/${ORPHAN_CLUSTER_NAME}`,
    liveDbHostSnippet: LIVE_DB_HOST_SNIPPET,
  };
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const args = new Set(process.argv.slice(2));
  if (args.has("--check")) {
    const summary = checkScriptLayout();
    console.log(
      `INT-331 footprint cleanup OK (orphan ${summary.orphanCluster}; live host ${summary.liveDbHostSnippet}; context ${summary.expectedContext}).`,
    );
  }
  if (args.has("--print")) {
    process.stdout.write(printOperatorSteps());
  }
  if (args.has("--apply")) {
    const result = applyFootprintCleanup();
    for (const line of result.actions) console.log(line);
  }
  if (![...args].some((a) => a === "--check" || a === "--print" || a === "--apply")) {
    console.error(
      "Usage: node scripts/dev-cluster-footprint-cleanup.mjs --check | --print | --apply",
    );
    process.exit(1);
  }
}
