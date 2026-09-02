#!/usr/bin/env node
/**
 * INT-291 — collect Vitest lcov.info paths for SonarQube javascript coverage.
 *
 * Usage:
 *   node scripts/sonar-lcov-paths.mjs            # print comma-separated paths
 *   node scripts/sonar-lcov-paths.mjs --github   # also append to $GITHUB_OUTPUT / ENV
 */
import { readdir, stat, appendFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOTS = ["apps", "services", "packages"];

export async function collectLcovPaths(repoRoot = root) {
  const found = [];
  for (const top of ROOTS) {
    const absTop = path.join(repoRoot, top);
    if (!(await exists(absTop))) continue;
    for (const name of await readdir(absTop)) {
      const lcov = path.join(absTop, name, "coverage", "lcov.info");
      if (await exists(lcov)) {
        found.push(path.relative(repoRoot, lcov).split(path.sep).join("/"));
      }
    }
  }
  found.sort((a, b) => a.localeCompare(b));
  return found;
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const paths = await collectLcovPaths();
  const joined = paths.join(",");
  process.stdout.write(`${joined}\n`);
  if (process.argv.includes("--github")) {
    const out = process.env.GITHUB_OUTPUT;
    const envFile = process.env.GITHUB_ENV;
    if (out) {
      await appendFile(out, `lcov_report_paths=${joined}\n`);
      await appendFile(out, `lcov_count=${paths.length}\n`);
    }
    if (envFile) {
      await appendFile(envFile, `SONAR_LCOV_REPORT_PATHS=${joined}\n`);
    }
  }
  if (paths.length === 0) {
    console.error("sonar-lcov-paths: no coverage/lcov.info found under apps|services|packages");
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
