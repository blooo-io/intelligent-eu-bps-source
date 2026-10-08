#!/usr/bin/env node
/**
 * INT-305 — cut an annotated SemVer git tag from a clean develop tip.
 *
 * Usage:
 *   node scripts/cut-release.mjs --dry-run
 *   node scripts/cut-release.mjs --push
 *   node scripts/cut-release.mjs --version 1.0.1 --dry-run
 *
 * The root package.json version (without leading "v") must match the tag.
 * Tags are never moved; retagging is refused if the ref already exists.
 */
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CORE_NUM = /^(0|[1-9]\d*)$/;
const PRE_IDENT = /^[0-9A-Za-z-]+$/;

/** @param {string} version SemVer without leading "v" */
export function isSemVer(version) {
  const noBuild = version.split("+", 1)[0] ?? "";
  const [core, ...preParts] = noBuild.split("-");
  const nums = core.split(".");
  if (nums.length !== 3 || !nums.every((n) => CORE_NUM.test(n))) {
    return false;
  }
  if (preParts.length === 0) return true;
  const pre = preParts.join("-");
  if (!pre || pre.includes("..")) return false;
  return pre.split(".").every((p) => p.length > 0 && PRE_IDENT.test(p));
}

export function parseArgs(argv) {
  const out = { dryRun: false, push: false, version: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--push") out.push = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--version") {
      out.version = argv[++i] ?? null;
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  if (out.push && out.dryRun) {
    throw new Error("Use either --dry-run or --push, not both");
  }
  if (!out.push && !out.dryRun && !out.help) {
    out.dryRun = true;
  }
  return out;
}

/** @param {string} version */
export function tagFromVersion(version) {
  const v = version.trim().replace(/^v/i, "");
  if (!isSemVer(v)) {
    throw new Error(`Invalid SemVer version: ${version}`);
  }
  return `v${v}`;
}

/** @param {string} tag */
export function versionFromTag(tag) {
  const t = tag.trim();
  if (!t.startsWith("v")) {
    throw new Error(`Tag must start with "v": ${tag}`);
  }
  const v = t.slice(1);
  if (!isSemVer(v)) {
    throw new Error(`Invalid SemVer in tag: ${tag}`);
  }
  return v;
}

/**
 * @param {{ version: string, packageVersion: string }} input
 */
export function assertPackageMatchesVersion(input) {
  const expected = input.version.replace(/^v/i, "");
  if (input.packageVersion !== expected) {
    throw new Error(
      `package.json version is "${input.packageVersion}" but release version is "${expected}". ` +
        "Bump package.json on develop (PR) before cutting the tag.",
    );
  }
}

/**
 * @param {string} root
 * @param {(cmd: string, args: string[]) => string} run
 */
export function assertGitReady(root, run) {
  const status = run("git", ["-C", root, "status", "--porcelain"]).trim();
  if (status) {
    throw new Error("Working tree is not clean. Commit or stash before cutting a release.");
  }
  const branch = run("git", ["-C", root, "rev-parse", "--abbrev-ref", "HEAD"]).trim();
  if (branch !== "develop") {
    throw new Error(`Expected branch develop, got "${branch}". Checkout develop first.`);
  }
}

/**
 * @param {string} root
 * @param {string} tag
 * @param {(cmd: string, args: string[]) => string} run
 */
export function assertTagAbsent(root, tag, run) {
  try {
    run("git", ["-C", root, "rev-parse", "--verify", "--quiet", `refs/tags/${tag}`]);
  } catch {
    return;
  }
  throw new Error(`Tag ${tag} already exists. Tags are immutable (INT-305); cut a new version.`);
}

function defaultRun(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8" });
}

function printHelp() {
  console.log(`Usage: node scripts/cut-release.mjs [--dry-run|--push] [--version X.Y.Z]

Creates an annotated SemVer tag (vX.Y.Z) matching root package.json.
Default mode is --dry-run. See docs/release/VERSIONING.md (INT-305).`);
}

async function main(argv, deps = {}) {
  const run = deps.run ?? defaultRun;
  const root = deps.root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return { ok: true, dryRun: true };
  }

  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const version = args.version ? args.version.replace(/^v/i, "") : pkg.version;
  const tag = tagFromVersion(version);
  assertPackageMatchesVersion({ version, packageVersion: pkg.version });
  assertGitReady(root, run);
  assertTagAbsent(root, tag, run);

  const sha = run("git", ["-C", root, "rev-parse", "HEAD"]).trim();
  const message = `Release ${tag}`;

  console.log(`Release candidate: ${tag}`);
  console.log(`  package.json version: ${pkg.version}`);
  console.log(`  commit: ${sha}`);
  console.log(`  branch: develop`);

  if (args.dryRun) {
    console.log("Dry-run only. Re-run with --push to create and push the annotated tag.");
    return { ok: true, dryRun: true, tag, sha };
  }

  run("git", ["-C", root, "tag", "-a", tag, "-m", message]);
  run("git", ["-C", root, "push", "origin", tag]);
  console.log(`Pushed annotated tag ${tag}. Workflow "release" will publish the GitHub Release.`);
  return { ok: true, dryRun: false, tag, sha };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    await main(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

export { main };
