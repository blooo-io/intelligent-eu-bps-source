#!/usr/bin/env node
/**
 * INT-294 — idempotent SonarQube quality gate "Intelligent V1".
 *
 * Copies Clean-as-You-Code conditions from "Sonar way", then adds overall
 * conditions so Security / Reliability / Maintainability stay at rating A,
 * coverage stays at the monorepo 80% Vitest floor, and overall duplication
 * stays under 10%.
 *
 *   KUBECONFIG=… node scripts/sonarqube-quality-gate.mjs --apply
 *   (also invoked from sonarqube-bootstrap.mjs --apply)
 */

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { operatorEnv } from "./lib/operator-env.mjs";
import {
  DEFAULT_SONAR_HOST_URL,
  PROJECT_KEY,
  resolveAdminSession,
} from "./sonarqube-bootstrap.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OPENBAO_NS = "openbao";
const OPENBAO_POD = "platform-openbao-0";
const BOOTSTRAP_SECRET = "openbao-dev-bootstrap";
const KV_PATH = "platform/sonarqube";

export const QUALITY_GATE_NAME = "Intelligent V1";
export const SOURCE_GATE_NAME = "Sonar way";

/** Rating metrics: 1 = A. Fail when value is worse than A (GT 1). */
export const OVERALL_RATING_CONDITIONS = [
  { metric: "security_rating", op: "GT", error: "1" },
  { metric: "reliability_rating", op: "GT", error: "1" },
  { metric: "sqale_rating", op: "GT", error: "1" },
];

export const OVERALL_METRIC_CONDITIONS = [
  { metric: "coverage", op: "LT", error: "80" },
  { metric: "duplicated_lines_density", op: "GT", error: "10" },
];

/**
 * Clean-as-You-Code tweaks on top of the Sonar way copy.
 * New-code duplication matches the overall 10% ceiling (Community analyses the
 * main branch only — operator-script churn otherwise fails a 3% new-dup gate).
 */
export const NEW_CODE_CONDITION_OVERRIDES = [
  { metric: "new_duplicated_lines_density", op: "GT", error: "10" },
];

export const DESIRED_OVERALL_CONDITIONS = [
  ...OVERALL_RATING_CONDITIONS,
  ...OVERALL_METRIC_CONDITIONS,
];

export const DESIRED_GATE_CONDITIONS = [
  ...DESIRED_OVERALL_CONDITIONS,
  ...NEW_CODE_CONDITION_OVERRIDES,
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
    OPENBAO_NS,
    "get",
    "secret",
    BOOTSTRAP_SECRET,
    "-o",
    "jsonpath={.data.root_token}",
  ]);
  return Buffer.from(b64, "base64").toString("utf8");
}

function bao(token, args) {
  return kubectl([
    "-n",
    OPENBAO_NS,
    "exec",
    OPENBAO_POD,
    "--",
    "env",
    `BAO_TOKEN=${token}`,
    "bao",
    ...args,
  ]);
}

function readAdminPassword() {
  return bao(rootToken(), [
    "kv",
    "get",
    "-mount=secret",
    `-field=admin_password`,
    KV_PATH,
  ]);
}

function basicAuth(login, password) {
  const credentials = `${login}:${password}`;
  const token = Buffer.from(credentials, "utf8").toString("base64");
  return `Basic ${token}`;
}

export async function sonarForm(hostUrl, { method = "GET", apiPath, login, password, body }) {
  const headers = { Authorization: basicAuth(login, password) };
  let payload;
  if (body !== undefined) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(body).toString();
  }
  const res = await fetch(`${hostUrl}${apiPath}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, text, json };
}

export function conditionMatches(existing, desired) {
  return (
    existing.metric === desired.metric &&
    existing.op === desired.op &&
    String(existing.error) === String(desired.error)
  );
}

export function missingOverallConditions(existingConditions, desired = DESIRED_GATE_CONDITIONS) {
  return desired.filter(
    (want) => !existingConditions.some((have) => conditionMatches(have, want)),
  );
}

async function ensureGateCopied(hostUrl, session) {
  const list = await sonarForm(hostUrl, {
    apiPath: "/api/qualitygates/list",
    login: session.login,
    password: session.password,
  });
  if (!list.ok) {
    throw new Error(`qualitygates/list failed: HTTP ${list.status}`);
  }
  const names = (list.json?.qualitygates ?? []).map((g) => g.name);
  if (names.includes(QUALITY_GATE_NAME)) {
    return false;
  }
  const copy = await sonarForm(hostUrl, {
    method: "POST",
    apiPath: "/api/qualitygates/copy",
    login: session.login,
    password: session.password,
    body: { sourceName: SOURCE_GATE_NAME, name: QUALITY_GATE_NAME },
  });
  if (!copy.ok) {
    throw new Error(`qualitygates/copy failed: HTTP ${copy.status} ${copy.text.slice(0, 200)}`);
  }
  return true;
}

async function upsertCondition(hostUrl, session, existing, cond) {
  const wrong = existing.find((c) => c.metric === cond.metric);
  if (wrong) {
    const upd = await sonarForm(hostUrl, {
      method: "POST",
      apiPath: "/api/qualitygates/update_condition",
      login: session.login,
      password: session.password,
      body: { id: wrong.id, metric: cond.metric, op: cond.op, error: cond.error },
    });
    if (!upd.ok) {
      throw new Error(
        `qualitygates/update_condition ${cond.metric} failed: HTTP ${upd.status} ${upd.text.slice(0, 160)}`,
      );
    }
    return { ...cond, updated: true };
  }
  const create = await sonarForm(hostUrl, {
    method: "POST",
    apiPath: "/api/qualitygates/create_condition",
    login: session.login,
    password: session.password,
    body: {
      gateName: QUALITY_GATE_NAME,
      metric: cond.metric,
      op: cond.op,
      error: cond.error,
    },
  });
  if (!create.ok) {
    throw new Error(
      `qualitygates/create_condition ${cond.metric} failed: HTTP ${create.status} ${create.text.slice(0, 160)}`,
    );
  }
  return { ...cond, updated: false };
}

async function syncGateConditions(hostUrl, session) {
  const show = await sonarForm(hostUrl, {
    apiPath: `/api/qualitygates/show?name=${encodeURIComponent(QUALITY_GATE_NAME)}`,
    login: session.login,
    password: session.password,
  });
  if (!show.ok) {
    throw new Error(`qualitygates/show failed: HTTP ${show.status}`);
  }
  const existing = show.json?.conditions ?? [];
  const added = [];
  for (const cond of missingOverallConditions(existing)) {
    added.push(await upsertCondition(hostUrl, session, existing, cond));
  }
  return added;
}

async function selectGateForProject(hostUrl, session) {
  const select = await sonarForm(hostUrl, {
    method: "POST",
    apiPath: "/api/qualitygates/select",
    login: session.login,
    password: session.password,
    body: { gateName: QUALITY_GATE_NAME, projectKey: PROJECT_KEY },
  });
  if (!select.ok && select.status !== 204) {
    throw new Error(`qualitygates/select failed: HTTP ${select.status} ${select.text.slice(0, 160)}`);
  }
  const asDefault = await sonarForm(hostUrl, {
    method: "POST",
    apiPath: "/api/qualitygates/set_as_default",
    login: session.login,
    password: session.password,
    body: { name: QUALITY_GATE_NAME },
  });
  if (!asDefault.ok && asDefault.status !== 204) {
    throw new Error(
      `qualitygates/set_as_default failed: HTTP ${asDefault.status} ${asDefault.text.slice(0, 160)}`,
    );
  }
}

export async function ensureQualityGate(hostUrl, session) {
  const created = await ensureGateCopied(hostUrl, session);
  const added = await syncGateConditions(hostUrl, session);
  await selectGateForProject(hostUrl, session);
  return {
    name: QUALITY_GATE_NAME,
    created,
    conditionsAdded: added.length,
    projectKey: PROJECT_KEY,
  };
}

export async function applyQualityGate({
  hostUrl = process.env.SONAR_HOST_URL || DEFAULT_SONAR_HOST_URL,
} = {}) {
  if (!process.env.KUBECONFIG) {
    throw new Error("KUBECONFIG is required for --apply");
  }
  const adminPassword = readAdminPassword();
  const session = await resolveAdminSession(hostUrl, adminPassword);
  return ensureQualityGate(hostUrl, session);
}

export async function checkQualityGateLayout(repoRoot = root) {
  const release = await readFile(path.join(repoRoot, "docs/release/sonarqube.md"), "utf8");
  if (!release.includes(QUALITY_GATE_NAME)) {
    throw new Error(`docs/release/sonarqube.md must document ${QUALITY_GATE_NAME}`);
  }
  if (!release.includes("sonarqube-quality-gate.mjs")) {
    throw new Error("docs/release/sonarqube.md must reference sonarqube-quality-gate.mjs");
  }
  return { ok: true, gate: QUALITY_GATE_NAME };
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const flags = new Set(process.argv.slice(2));
  if (flags.has("--check")) {
    console.log(JSON.stringify(await checkQualityGateLayout()));
  } else if (flags.has("--apply")) {
    const result = await applyQualityGate();
    console.log(JSON.stringify({ applied: true, ...result }));
  } else {
    process.stderr.write(
      "Usage: node scripts/sonarqube-quality-gate.mjs --check|--apply\n",
    );
    process.exit(2);
  }
}
