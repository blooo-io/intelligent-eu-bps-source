/**
 * INT-331 — V1/dev footprint cleanup packaging (orphan default/int-data + demo apps).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  checkScriptLayout,
  printOperatorSteps,
} from "./dev-cluster-footprint-cleanup.mjs";

test("footprint cleanup script documents orphan CNPG and demo apps (INT-331)", async () => {
  const summary = checkScriptLayout();
  assert.equal(summary.expectedContext, "admin@k8s-intelligent-eu-dev");
  assert.equal(summary.orphanCluster, "default/int-data");
  assert.match(summary.liveDbHostSnippet, /int-data-rw\.int-data\.svc/);

  const printed = printOperatorSteps();
  assert.match(printed, /admin@k8s-intelligent-eu-dev/);
  assert.match(printed, /cluster\.postgresql\.cnpg\.io int-data -n default/);
  assert.match(printed, /grep '\^demo-'/);
  assert.equal(printed.includes("stringData:"), false);

  const source = await readFile(
    new URL("./dev-cluster-footprint-cleanup.mjs", import.meta.url),
    "utf8",
  );
  // Prefer jsonpath over dumping every pod object into the Node spawn buffer.
  assert.match(source, /jsonpath=/);
  assert.equal(source.includes('["get", "pods", "-A", "-o", "json"]'), false);
});

test("platform and Argo READMEs document INT-331 footprint steps", async () => {
  const platform = await readFile("deploy/platform/README.md", "utf8");
  assert.match(platform, /INT-331/);
  assert.match(platform, /dev-cluster-footprint-cleanup/);
  assert.match(platform, /sonar\.web\.javaOpts|sonarProperties/);
  assert.match(platform, /retention:\s*2d|retention 2d|2d/);

  const argo = await readFile("deploy/argocd/README.md", "utf8");
  assert.match(argo, /INT-331/);
  assert.match(argo, /dev-cluster-footprint-cleanup/);
});
