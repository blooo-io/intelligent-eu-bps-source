#!/usr/bin/env node
/**
 * INT-438 — probe real `dev` evidence (no silent mocks).
 *
 * Writes docs/testing/evidence/<UTC-date>/probe.json with Ready counts,
 * ExternalSecret CGW sync status, Stripe test-mode ping (if STRIPE_SECRET_KEY),
 * and CGW identity attempt when a key is available via env (never logged).
 *
 * Usage: KUBECONFIG=... node scripts/collect-dev-evidence.mjs
 * Exit 0 always writes the report; exit 2 when hard blockers remain.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ns = process.env.EVIDENCE_NAMESPACE || "int-apps";
const today = new Date().toISOString().slice(0, 10);

function kubectl(args) {
  const r = spawnSync("kubectl", args, { encoding: "utf8" });
  return {
    ok: r.status === 0,
    status: r.status ?? 1,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
  };
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

const report = {
  collectedAt: new Date().toISOString(),
  rulesRef: "docs/testing/v6.1-evidence-matrix.md",
  namespace: ns,
  pods: { ready: 0, total: 0, crashLoop: [] },
  externalSecretsCgw: [],
  stripeTest: { attempted: false, ok: false, detail: null },
  cgwIdentity: { attempted: false, ok: false, detail: null },
  blockers: [],
};

const pods = kubectl([
  "get",
  "pods",
  "-n",
  ns,
  "-o",
  "json",
]);
if (!pods.ok) {
  report.blockers.push({
    id: "kubectl-pods",
    message: pods.stderr.trim() || "kubectl get pods failed",
  });
} else {
  const items = parseJson(pods.stdout, { items: [] }).items || [];
  report.pods.total = items.length;
  for (const p of items) {
    const ready = (p.status?.containerStatuses || []).every((c) => c.ready);
    const waiting = (p.status?.containerStatuses || [])
      .map((c) => c.state?.waiting?.reason)
      .filter(Boolean);
    if (ready) report.pods.ready += 1;
    if (waiting.includes("CrashLoopBackOff")) {
      report.pods.crashLoop.push(p.metadata?.name);
    }
  }
  if (report.pods.crashLoop.length > 0) {
    report.blockers.push({
      id: "crashloop",
      message: `CrashLoopBackOff: ${report.pods.crashLoop.join(", ")}`,
    });
  }
}

const es = kubectl(["get", "externalsecret", "-n", ns, "-o", "json"]);
if (es.ok) {
  const items = parseJson(es.stdout, { items: [] }).items || [];
  for (const item of items) {
    const name = item.metadata?.name || "";
    if (!name.endsWith("-cgw")) continue;
    const cond = (item.status?.conditions || []).find(
      (c) => c.type === "Ready",
    );
    const row = {
      name,
      ready: cond?.status === "True",
      reason: cond?.reason || null,
      message: cond?.message || null,
    };
    report.externalSecretsCgw.push(row);
    if (!row.ready) {
      report.blockers.push({
        id: `externalsecret-${name}`,
        message: row.message || "CGW ExternalSecret not Ready",
      });
    }
  }
}

const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
if (stripeKey) {
  report.stripeTest.attempted = true;
  try {
    const res = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    report.stripeTest.ok = res.ok;
    report.stripeTest.detail = {
      httpStatus: res.status,
      // Never echo the key; balance shape proves test/live connectivity.
      hasAvailable: res.ok
        ? Array.isArray((await res.json()).available)
        : false,
    };
    if (!res.ok) {
      report.blockers.push({
        id: "stripe-test",
        message: `Stripe balance HTTP ${res.status}`,
      });
    }
  } catch (err) {
    report.stripeTest.detail = { error: String(err?.message || err) };
    report.blockers.push({ id: "stripe-test", message: report.stripeTest.detail.error });
  }
} else {
  report.blockers.push({
    id: "stripe-test",
    message: "STRIPE_SECRET_KEY not set in collector environment",
  });
}

const cgwKey = process.env.CGW_API_KEY?.trim();
const cgwBase =
  process.env.CGW_BASE_URL?.trim() || "http://127.0.0.1:3333";
if (cgwKey) {
  report.cgwIdentity.attempted = true;
  try {
    const res = await fetch(`${cgwBase.replace(/\/$/, "")}/api/v2/identity`, {
      headers: { "x-api-key": cgwKey },
    });
    report.cgwIdentity.ok = res.ok;
    if (res.ok) {
      const body = await res.json();
      report.cgwIdentity.detail = {
        httpStatus: res.status,
        hasDid: Boolean(body?.did || body?.identity),
      };
    } else {
      report.cgwIdentity.detail = { httpStatus: res.status };
      report.blockers.push({
        id: "cgw-identity",
        message: `CGW identity HTTP ${res.status}`,
      });
    }
  } catch (err) {
    report.cgwIdentity.detail = { error: String(err?.message || err) };
    report.blockers.push({
      id: "cgw-identity",
      message: report.cgwIdentity.detail.error,
    });
  }
} else {
  report.blockers.push({
    id: "cgw-api-key",
    message:
      "CGW_API_KEY unavailable to collector (OpenBao ExternalSecret *-cgw not Ready or not exported)",
  });
}

const outDir = path.join(root, "docs/testing/evidence", today);
await mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, "probe.json");
await writeFile(outFile, JSON.stringify(report, null, 2) + "\n");
process.stdout.write(`${outFile}\n`);
process.stdout.write(
  `ready ${report.pods.ready}/${report.pods.total}; blockers ${report.blockers.length}\n`,
);
process.exit(report.blockers.length > 0 ? 2 : 0);
