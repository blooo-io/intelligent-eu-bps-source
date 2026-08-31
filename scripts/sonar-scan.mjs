#!/usr/bin/env node
/**
 * INT-291 — run analysis with the official SonarQube Scanner CLI (Docker).
 *
 * Env:
 *   SONAR_TOKEN       (required)
 *   SONAR_HOST_URL    (default https://sonarcloud.io)
 *   SONAR_ORGANIZATION (default blooo-io, SonarCloud)
 *   SONAR_LCOV_REPORT_PATHS  (optional; otherwise resolved via sonar-lcov-paths.mjs)
 *   SONAR_SCANNER_IMAGE (default sonarsource/sonar-scanner-cli:11.3)
 *
 * GitHub Actions extras (optional):
 *   GITHUB_EVENT_NAME, GITHUB_REF_NAME, GITHUB_HEAD_REF, GITHUB_BASE_REF,
 *   GITHUB_EVENT_PULL_REQUEST_NUMBER, GITHUB_REPOSITORY
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectLcovPaths } from "./sonar-lcov-paths.mjs";

export const DEFAULT_SCANNER_IMAGE = "sonarsource/sonar-scanner-cli:11.3";

/** SonarCloud (and commercial Server) support PR/branch decoration; Community Build does not. */
export function isSonarCloudHost(host = "") {
  try {
    const { hostname } = new URL(host);
    return hostname === "sonarcloud.io" || hostname.endsWith(".sonarcloud.io");
  } catch {
    return false;
  }
}

export function buildScannerArgs(env = process.env, lcovPaths = "") {
  const host = env.SONAR_HOST_URL || "https://sonarcloud.io";
  const org = env.SONAR_ORGANIZATION || "blooo-io";
  const cloud = isSonarCloudHost(host);
  const args = [
    `-Dsonar.host.url=${host}`,
    `-Dsonar.qualitygate.wait=true`,
  ];
  // organization is a SonarCloud concept; omit for self-hosted Community (INT-292).
  if (cloud) {
    args.push(`-Dsonar.organization=${org}`);
  }
  if (lcovPaths) {
    args.push(`-Dsonar.javascript.lcov.reportPaths=${lcovPaths}`);
  }
  // INT-293 follow-up: Community Build rejects sonar.pullrequest.* and sonar.branch.name
  // (Developer Edition+). Analyze the checked-out tree as the project main branch instead.
  if (cloud) {
    if (env.GITHUB_EVENT_NAME === "pull_request") {
      const key =
        env.GITHUB_EVENT_PULL_REQUEST_NUMBER || env.SONAR_PULLREQUEST_KEY;
      const branch = env.GITHUB_HEAD_REF || env.SONAR_PULLREQUEST_BRANCH;
      const base = env.GITHUB_BASE_REF || env.SONAR_PULLREQUEST_BASE;
      const repo =
        env.GITHUB_REPOSITORY || env.SONAR_PULLREQUEST_GITHUB_REPOSITORY;
      if (key) args.push(`-Dsonar.pullrequest.key=${key}`);
      if (branch) args.push(`-Dsonar.pullrequest.branch=${branch}`);
      if (base) args.push(`-Dsonar.pullrequest.base=${base}`);
      args.push("-Dsonar.pullrequest.provider=github");
      if (repo) args.push(`-Dsonar.pullrequest.github.repository=${repo}`);
    } else if (env.GITHUB_REF_NAME) {
      args.push(`-Dsonar.branch.name=${env.GITHUB_REF_NAME}`);
    }
  }
  return args;
}

export function buildDockerArgs(env = process.env, lcovPaths = "", cwd = process.cwd()) {
  const image = env.SONAR_SCANNER_IMAGE || DEFAULT_SCANNER_IMAGE;
  const scannerArgs = buildScannerArgs(env, lcovPaths);
  return [
    "run",
    "--rm",
    "-e",
    "SONAR_TOKEN",
    "-e",
    "SONAR_HOST_URL",
    "-v",
    `${cwd}:/usr/src`,
    "-w",
    "/usr/src",
    image,
    ...scannerArgs,
  ];
}

export async function resolveLcovPaths(env = process.env) {
  if (env.SONAR_LCOV_REPORT_PATHS) {
    return env.SONAR_LCOV_REPORT_PATHS;
  }
  const paths = await collectLcovPaths();
  if (paths.length === 0) {
    throw new Error("No coverage/lcov.info found — run tests first");
  }
  return paths.join(",");
}

async function main() {
  if (!process.env.SONAR_TOKEN) {
    console.error("SONAR_TOKEN is required (see docs/release/sonarqube.md)");
    process.exit(1);
  }
  const lcov = await resolveLcovPaths();
  const dockerArgs = buildDockerArgs(process.env, lcov);
  console.log(`sonar-scan: docker ${dockerArgs.join(" ")}`);
  const child = spawn("docker", dockerArgs, {
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code, signal) => {
    if (signal) process.exit(1);
    process.exit(code ?? 1);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
