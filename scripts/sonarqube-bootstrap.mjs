#!/usr/bin/env node
/**
 * INT-293 — idempotent SonarQube Community bootstrap for V1 / virtual `dev`.
 *
 * After platform-sonarqube is Healthy (INT-292), operators / agents run (merged branch only — INT-157):
 *   KUBECONFIG=… node scripts/sonarqube-bootstrap.mjs --apply
 *
 * Steps (no secret values logged):
 *   1. Ensure OpenBao `platform/sonarqube` has `admin_password` (generate if missing)
 *   2. Wait for Sonar UP
 *   3. Replace default `admin`/`admin` with OpenBao admin password when still default
 *   4. Ensure project `blooo-io_intelligent-eu-billing-and-payment`
 *   5. Ensure project analysis token `ci-intelligent-eu`; store value in OpenBao `analysis_token`
 *   6. Print one-liner to sync GitHub Actions `SONAR_TOKEN` / `SONAR_HOST_URL`
 *      (this agent token cannot write GitHub secrets — 403)
 *
 * Optional:
 *   SONAR_HOST_URL=https://sonar.intelligent-eu-bp.blooo.dev
 *   SONAR_ADMIN_CURRENT_PASSWORD=…   # if default admin/admin was already changed in the UI
 *   --check / --print
 */

import { access, readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OPENBAO_NS = "openbao";
const OPENBAO_POD = "platform-openbao-0";
const BOOTSTRAP_SECRET = "openbao-dev-bootstrap";
const KV_PATH = "platform/sonarqube";

export const DEFAULT_SONAR_HOST_URL = "https://sonar.intelligent-eu-bp.blooo.dev";
export const PROJECT_KEY = "blooo-io_intelligent-eu-billing-and-payment";
export const PROJECT_NAME = "Intelligent EU Billing and Payment";
export const TOKEN_NAME = "ci-intelligent-eu";
export const DEFAULT_ADMIN_LOGIN = "admin";
export const DEFAULT_ADMIN_PASSWORD = "admin";

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

/** Parse `bao kv get -format=json` data.data map. */
export function parseBaoKvData(jsonText) {
  const parsed = JSON.parse(jsonText);
  return parsed?.data?.data ?? {};
}

export function generateAdminPassword() {
  // URL-safe, no ambiguous punctuation for Sonar password rules.
  return `Sq-${randomBytes(24).toString("base64url")}`;
}

export function buildGithubSyncCommands({
  hostUrl = DEFAULT_SONAR_HOST_URL,
  tokenPlaceholder = "$(bao kv get -mount=secret -field=analysis_token platform/sonarqube)",
} = {}) {
  return [
    `# Sync CI credentials (operator machine with repo admin + OpenBao access):`,
    `gh variable set SONAR_HOST_URL --repo blooo-io/intelligent-eu-billing-and-payment --body '${hostUrl}'`,
    `gh secret set SONAR_TOKEN --repo blooo-io/intelligent-eu-billing-and-payment --body "${tokenPlaceholder}"`,
  ].join("\n");
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForUp(hostUrl, { attempts = 60, delayMs = 5000 } = {}) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${hostUrl}/api/system/status`);
      if (res.ok) {
        const body = await res.json();
        if (body.status === "UP") return body;
      }
    } catch {
      // retry
    }
    await sleep(delayMs);
  }
  throw new Error(`SonarQube not UP at ${hostUrl} after ${attempts} attempts`);
}

function basicAuth(login, password) {
  return `Basic ${Buffer.from(`${login}:${password}`, "utf8").toString("base64")}`;
}

async function api(hostUrl, { method = "GET", path: apiPath, login, password, body }) {
  const headers = {
    Authorization: basicAuth(login, password),
  };
  let payload;
  if (body !== undefined) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(body).toString();
  }
  const res = await fetch(`${hostUrl}${apiPath}`, { method, headers, body: payload });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, text, json };
}

async function validateAdmin(hostUrl, password) {
  const res = await api(hostUrl, {
    path: "/api/authentication/validate",
    login: DEFAULT_ADMIN_LOGIN,
    password,
  });
  return Boolean(res.ok && res.json?.valid);
}

/**
 * Find a working admin password, then align it to `desiredPassword` (OpenBao).
 * Candidates: OpenBao value (if not placeholder), default admin/admin,
 * optional env SONAR_ADMIN_CURRENT_PASSWORD (when UI already changed the default).
 */
export async function resolveAdminSession(
  hostUrl,
  desiredPassword,
  { currentPasswordEnv = process.env.SONAR_ADMIN_CURRENT_PASSWORD } = {},
) {
  const candidates = [];
  if (currentPasswordEnv) candidates.push(currentPasswordEnv);
  if (desiredPassword && desiredPassword !== "dev-only-replace-me") {
    candidates.push(desiredPassword);
  }
  candidates.push(DEFAULT_ADMIN_PASSWORD);

  let current = null;
  for (const candidate of candidates) {
    if (await validateAdmin(hostUrl, candidate)) {
      current = candidate;
      break;
    }
  }
  if (!current) {
    throw new Error(
      "Cannot authenticate as admin. If the UI password was already changed, re-run with SONAR_ADMIN_CURRENT_PASSWORD=…",
    );
  }

  if (current === desiredPassword) {
    return { login: DEFAULT_ADMIN_LOGIN, password: desiredPassword, changedDefault: false };
  }

  const change = await api(hostUrl, {
    method: "POST",
    path: "/api/users/change_password",
    login: DEFAULT_ADMIN_LOGIN,
    password: current,
    body: {
      login: DEFAULT_ADMIN_LOGIN,
      password: desiredPassword,
      previousPassword: current,
    },
  });
  if (!change.ok && change.status !== 204) {
    throw new Error(`change_password failed: HTTP ${change.status} ${change.text.slice(0, 200)}`);
  }
  return {
    login: DEFAULT_ADMIN_LOGIN,
    password: desiredPassword,
    changedDefault: current === DEFAULT_ADMIN_PASSWORD,
  };
}

export async function ensureProject(hostUrl, session) {
  const search = await api(hostUrl, {
    path: `/api/projects/search?projects=${encodeURIComponent(PROJECT_KEY)}`,
    login: session.login,
    password: session.password,
  });
  if (!search.ok) {
    throw new Error(`projects/search failed: HTTP ${search.status}`);
  }
  const existing = search.json?.components?.some((c) => c.key === PROJECT_KEY);
  if (existing) return { created: false };

  const create = await api(hostUrl, {
    method: "POST",
    path: "/api/projects/create",
    login: session.login,
    password: session.password,
    body: {
      project: PROJECT_KEY,
      name: PROJECT_NAME,
      visibility: "private",
    },
  });
  // 400 when already exists (race) is acceptable
  if (!create.ok && create.status !== 400) {
    throw new Error(`projects/create failed: HTTP ${create.status} ${create.text.slice(0, 200)}`);
  }
  return { created: create.ok };
}

async function tokenValid(hostUrl, token) {
  if (!token) return false;
  const res = await fetch(`${hostUrl}/api/authentication/validate`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return false;
  const body = await res.json();
  return body.valid === true;
}

export async function ensureAnalysisToken(hostUrl, session, existingToken) {
  if (await tokenValid(hostUrl, existingToken)) {
    return { token: existingToken, rotated: false };
  }

  // Revoke stale named token so we can mint a new value (tokens are one-shot).
  await api(hostUrl, {
    method: "POST",
    path: "/api/user_tokens/revoke",
    login: session.login,
    password: session.password,
    body: { name: TOKEN_NAME },
  });

  const gen = await api(hostUrl, {
    method: "POST",
    path: "/api/user_tokens/generate",
    login: session.login,
    password: session.password,
    body: {
      name: TOKEN_NAME,
      type: "PROJECT_ANALYSIS_TOKEN",
      projectKey: PROJECT_KEY,
    },
  });
  if (!gen.ok || !gen.json?.token) {
    // Fallback for editions that reject PROJECT_ANALYSIS_TOKEN
    const globalGen = await api(hostUrl, {
      method: "POST",
      path: "/api/user_tokens/generate",
      login: session.login,
      password: session.password,
      body: {
        name: TOKEN_NAME,
        type: "GLOBAL_ANALYSIS_TOKEN",
      },
    });
    if (!globalGen.ok || !globalGen.json?.token) {
      throw new Error(
        `user_tokens/generate failed: HTTP ${gen.status}/${globalGen.status} ${gen.text.slice(0, 120)}`,
      );
    }
    return { token: globalGen.json.token, rotated: true, type: "GLOBAL_ANALYSIS_TOKEN" };
  }
  return { token: gen.json.token, rotated: true, type: "PROJECT_ANALYSIS_TOKEN" };
}

function readKvMap(token) {
  try {
    const raw = bao(token, ["kv", "get", "-mount=secret", "-format=json", KV_PATH]);
    return parseBaoKvData(raw);
  } catch {
    return {};
  }
}

function writeKvMerge(token, patch) {
  const current = readKvMap(token);
  const merged = { ...current, ...patch, seeded: "true" };
  const fields = Object.entries(merged).map(([k, v]) => `${k}=${v}`);
  bao(token, ["kv", "put", "-mount=secret", KV_PATH, ...fields]);
  return merged;
}

export async function checkBootstrapLayout(repoRoot = root) {
  await access(path.join(repoRoot, "deploy/platform/README.md"));
  const readme = await readFile(path.join(repoRoot, "deploy/platform/README.md"), "utf8");
  if (!readme.includes("sonarqube-bootstrap.mjs")) {
    throw new Error("deploy/platform/README.md must reference sonarqube-bootstrap.mjs");
  }
  const release = await readFile(path.join(repoRoot, "docs/release/sonarqube.md"), "utf8");
  if (!release.includes("sonarqube-bootstrap.mjs")) {
    throw new Error("docs/release/sonarqube.md must reference sonarqube-bootstrap.mjs");
  }
  return { ok: true };
}

export function printBootstrapSteps() {
  return `# INT-293 — bootstrap SonarQube Community (admin password, project, CI token)
# Requires: platform-sonarqube Healthy, OpenBao unsealed, DNS/TLS for sonar host (INT-292).
# Run only from a merged branch (INT-157). Never commit token/password values.

KUBECONFIG=… node scripts/sonarqube-bootstrap.mjs --apply

# If the UI already replaced admin/admin:
# SONAR_ADMIN_CURRENT_PASSWORD='…' KUBECONFIG=… node scripts/sonarqube-bootstrap.mjs --apply

# Then sync GitHub Actions (needs repo admin — agent tokens often cannot):
${buildGithubSyncCommands()}
`;
}

export async function applyBootstrap({
  hostUrl = process.env.SONAR_HOST_URL || DEFAULT_SONAR_HOST_URL,
  kubectlFn = kubectl,
  baoReadWrite = true,
} = {}) {
  if (!process.env.KUBECONFIG && baoReadWrite) {
    throw new Error("KUBECONFIG is required for --apply");
  }
  // Touch kubectlFn so tests can inject without OpenBao.
  void kubectlFn;

  const token = rootToken();
  let kv = readKvMap(token);
  let adminPassword = kv.admin_password;
  if (!adminPassword || adminPassword === "dev-only-replace-me") {
    adminPassword = generateAdminPassword();
    kv = writeKvMerge(token, { admin_password: adminPassword });
  }

  await waitForUp(hostUrl);
  const session = await resolveAdminSession(hostUrl, adminPassword);
  const project = await ensureProject(hostUrl, session);
  const analysis = await ensureAnalysisToken(hostUrl, session, kv.analysis_token);
  if (analysis.rotated) {
    writeKvMerge(token, { analysis_token: analysis.token });
  }

  return {
    hostUrl,
    projectKey: PROJECT_KEY,
    projectCreated: project.created,
    adminPasswordChanged: session.changedDefault,
    tokenRotated: analysis.rotated,
    tokenType: analysis.type ?? "existing",
    githubSync: buildGithubSyncCommands({ hostUrl }),
  };
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const args = process.argv.slice(2);
  if (args.includes("--check")) {
    console.log(JSON.stringify(await checkBootstrapLayout()));
  } else if (args.includes("--print")) {
    process.stdout.write(printBootstrapSteps());
  } else if (args.includes("--apply")) {
    const result = await applyBootstrap();
    // Never print admin password or analysis token.
    console.log(
      JSON.stringify({
        applied: true,
        hostUrl: result.hostUrl,
        projectKey: result.projectKey,
        projectCreated: result.projectCreated,
        adminPasswordChanged: result.adminPasswordChanged,
        tokenRotated: result.tokenRotated,
        tokenType: result.tokenType,
      }),
    );
    process.stdout.write(`\n${result.githubSync}\n`);
  } else {
    process.stderr.write("Usage: node scripts/sonarqube-bootstrap.mjs --check|--print|--apply\n");
    process.exit(2);
  }
}
