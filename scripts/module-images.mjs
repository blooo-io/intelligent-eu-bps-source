#!/usr/bin/env node
// Discover module Dockerfiles and, when asked, build and scan their images.
// INT-183: optionally build only images affected by the push diff.
import { execFileSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { operatorEnv } from "./lib/operator-env.mjs";

const IMAGE_ROOTS = ["services", "apps", "packages", "mocks"];

/**
 * Paths that invalidate every module image (shared workspace / base image).
 * INT-185: `pnpm-lock.yaml` is NOT global — see selectDockerfilesForChangedPaths.
 */
const GLOBAL_REBUILD_PREFIXES = [
  "packages/",
  "config/",
  "scripts/module-images.mjs",
  "pnpm-workspace.yaml",
  "package.json",
  "trivy.yaml",
  "trivy-image.yaml",
  ".trivyignore",
  "Dockerfile",
];

/**
 * Paths that never affect module image layers on their own.
 * INT-185: `scripts/**` except `scripts/module-images.mjs` (handled as global).
 */
const SKIP_ONLY_PREFIXES = [
  "deploy/",
  "docs/",
  "contracts/",
  "brain/",
  ".cursor/",
  ".github/",
  "scripts/",
];

const LOCKFILE_PATH = "pnpm-lock.yaml";

export async function findDockerfiles(root) {
  const found = [];
  if (await exists(path.join(root, "Dockerfile"))) found.push("Dockerfile");
  for (const directory of IMAGE_ROOTS) {
    await walk(root, directory, found);
  }
  return found.sort((a, b) => a.localeCompare(b));
}

export function imageSuffix(relativeDockerfile) {
  const normalized = relativeDockerfile.split(path.sep).join("/");
  if (normalized === "Dockerfile") return "workspace";
  return normalized.replace(/\/Dockerfile$/, "").replaceAll("/", "-");
}

export function dockerfileRunsAsNonRoot(source) {
  const users = [...source.matchAll(/^[ \t]*USER[ \t]+(?:"([^"]+)"|([^\s]+))/gm)].map(
    (match) => match[1] ?? match[2],
  );
  if (users.length === 0) return false;
  const last = users.at(-1);
  return last !== "root" && last !== "0";
}

/**
 * INT-183 / INT-185 — map git-changed paths to Dockerfiles that must be rebuilt.
 * Returns:
 * - allDockerfiles when a shared/global path changed, or when selection is unsafe
 * - [] when every change is under skip-only prefixes (docs/deploy/contracts/scripts…)
 * - the intersection of matched module Dockerfiles otherwise
 *
 * Lockfile (INT-185): `pnpm-lock.yaml` alone does not force FULL. Combined with
 * only `apps/<name>/` changes → that app image; with a service package.json
 * or anything under packages/ → FULL.
 *
 * @param {string[]} changedPaths
 * @param {string[]} allDockerfiles
 * @returns {string[]}
 */
/**
 * @returns {"all" | "skip" | "module"}
 */
function classifyChangedPath(filePath, known, selected) {
  if (filePath === LOCKFILE_PATH) {
    return "skip";
  }
  if (isSkipOnlyPath(filePath)) {
    return "skip";
  }
  const dockerfile = dockerfileForModulePath(filePath);
  if (dockerfile && known.has(dockerfile)) {
    selected.add(dockerfile);
    return "module";
  }
  if (!dockerfile) {
    return "all";
  }
  return "module";
}

function mergeLockfileDockerfiles(paths, known, selected, normalizedAll) {
  const lockDecision = lockfileRebuildScope(paths, known);
  if (lockDecision.includes("*")) {
    return [...normalizedAll];
  }
  for (const dockerfile of lockDecision) {
    selected.add(dockerfile);
  }
  return null;
}

export function selectDockerfilesForChangedPaths(changedPaths, allDockerfiles) {
  const normalizedAll = allDockerfiles.map((d) => d.split(path.sep).join("/"));
  const known = new Set(normalizedAll);

  if (!changedPaths || changedPaths.length === 0) {
    return [...normalizedAll];
  }

  const paths = changedPaths.map((p) => p.split(path.sep).join("/"));

  if (paths.some((p) => isGlobalImageRebuildPath(p))) {
    return [...normalizedAll];
  }

  const lockfileChanged = paths.includes(LOCKFILE_PATH);
  const selected = new Set();
  const scan = scanChangedPaths(paths, known, selected);
  if (scan === "all") {
    return [...normalizedAll];
  }

  if (lockfileChanged) {
    const full = mergeLockfileDockerfiles(paths, known, selected, normalizedAll);
    if (full) {
      return full;
    }
  }

  if (!scan) {
    return [];
  }

  return [...selected].sort((a, b) => a.localeCompare(b));
}

/**
 * @returns {"all" | boolean} — false when only skip-only paths changed.
 */
function scanChangedPaths(paths, known, selected) {
  let sawNonSkip = false;
  for (const filePath of paths) {
    const kind = classifyChangedPath(filePath, known, selected);
    if (kind === "all") {
      return "all";
    }
    if (kind !== "skip" || filePath === LOCKFILE_PATH) {
      sawNonSkip = true;
    }
  }
  return sawNonSkip;
}

/**
 * INT-185 — interpret pnpm-lock.yaml with companion package.json changes.
 */
function manifestsForceFullRebuild(manifests) {
  return manifests.some(
    (p) =>
      p === "package.json" ||
      p.startsWith("packages/") ||
      p.startsWith("services/") ||
      p.startsWith("mocks/"),
  );
}

function dockerfilesFromAppManifests(manifests, knownDockerfiles) {
  const fromApps = [];
  for (const manifest of manifests) {
    const match = manifest.match(/^apps\/([^/]+)\/package\.json$/);
    if (!match) continue;
    const dockerfile = `apps/${match[1]}/Dockerfile`;
    if (knownDockerfiles.has(dockerfile)) fromApps.push(dockerfile);
  }
  return fromApps;
}

function lockfileModuleHits(changedPaths, knownDockerfiles) {
  return changedPaths
    .map((p) => dockerfileForModulePath(p))
    .filter((d) => d && knownDockerfiles.has(d));
}

/** @returns {string[]} Dockerfile paths, or `["*"]` meaning rebuild every image. */
export function lockfileRebuildScope(changedPaths, knownDockerfiles) {
  const manifests = changedPaths.filter(
    (p) => p === "package.json" || p.endsWith("/package.json"),
  );

  if (manifestsForceFullRebuild(manifests)) {
    return ["*"];
  }

  const fromApps = dockerfilesFromAppManifests(manifests, knownDockerfiles);

  if (fromApps.length > 0) return fromApps;
  if (manifests.length === 0) {
    const moduleHits = lockfileModuleHits(changedPaths, knownDockerfiles);
    if (moduleHits.length > 0) return [...new Set(moduleHits)];
    return ["*"];
  }
  return ["*"];
}

export function isGlobalImageRebuildPath(filePath) {
  const normalized = filePath.split(path.sep).join("/");
  if (normalized === LOCKFILE_PATH) return false;
  if (normalized === "Dockerfile") return true;
  return GLOBAL_REBUILD_PREFIXES.some((prefix) => {
    if (prefix.endsWith("/")) return normalized.startsWith(prefix);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  });
}

export function isSkipOnlyPath(filePath) {
  const normalized = filePath.split(path.sep).join("/");
  // scripts/module-images.mjs is global, not skip.
  if (normalized === "scripts/module-images.mjs") return false;
  return SKIP_ONLY_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}
/**
 * Map a changed file to its module Dockerfile when the path is under a
 * single-module tree (services|apps|mocks/<name>/…).
 * @param {string} filePath
 * @returns {string | null}
 */
export function dockerfileForModulePath(filePath) {
  const normalized = filePath.split(path.sep).join("/");
  const modulePathRe = /^(services|apps|mocks)\/([^/]+)\//;
  const match = modulePathRe.exec(normalized);
  if (!match) return null;
  return `${match[1]}/${match[2]}/Dockerfile`;
}

/**
 * INT-318 — when `github.event.before` is empty or all zeros (force-push,
 * mirror sync, rewritten tip), use the first parent of `after` so selective
 * image builds still see a real diff instead of rebuilding every module.
 *
 * @param {string} root
 * @param {string} before
 * @param {string} after
 * @param {(root: string, args: string[]) => string} [runGit]
 * @returns {string}
 */
export function resolveImageDiffBase(root, before, after, runGit = defaultRunGit) {
  const trimmed = (before ?? "").trim();
  if (trimmed && !/^0+$/.test(trimmed)) return trimmed;
  const head = (after ?? "").trim();
  if (!head || /^0+$/.test(head)) return trimmed;
  try {
    return runGit(root, ["rev-parse", "--verify", `${head}^`]).trim();
  } catch {
    return trimmed;
  }
}

/**
 * List paths changed between two commits. Returns null when the base is
 * missing / unreachable (caller should rebuild all).
 * @param {string} root
 * @param {string} before
 * @param {string} after
 * @returns {string[] | null}
 */
export function listChangedPaths(root, before, after, runGit = defaultRunGit) {
  if (!before || !after || /^0+$/.test(before)) {
    return null;
  }
  try {
    runGit(root, ["cat-file", "-e", `${before}^{commit}`]);
  } catch {
    return null;
  }
  const output = runGit(root, [
    "diff",
    "--name-only",
    "--diff-filter=ACMRD",
    before,
    after,
  ]);
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function defaultRunGit(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: operatorEnv(),
  });
}

async function walk(root, directory, found) {
  const absolute = path.join(root, directory);
  if (!(await exists(absolute))) return;
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(root, relative, found);
      continue;
    }
    if (entry.name === "Dockerfile") found.push(relative.split(path.sep).join("/"));
  }
}

function exists(filePath) {
  return stat(filePath).then(
    () => true,
    () => false,
  );
}

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", cwd: options.cwd, ...options });
}

/**
 * Resolve which Dockerfiles to build for this run (INT-183).
 * @param {string} root
 * @param {string[]} allDockerfiles
 * @param {NodeJS.ProcessEnv} [env]
 * @param {(root: string, before: string, after: string) => string[] | null} [diffFn]
 * @param {(root: string, before: string, after: string) => string} [resolveBaseFn]
 */
export function resolveDockerfilesToBuild(
  root,
  allDockerfiles,
  env = process.env,
  diffFn = listChangedPaths,
  resolveBaseFn = resolveImageDiffBase,
) {
  if (env.IMAGE_CHANGED_ONLY !== "true") {
    return { dockerfiles: allDockerfiles, reason: "full (IMAGE_CHANGED_ONLY unset)" };
  }

  const rawBefore = env.IMAGE_DIFF_BASE?.trim() || env.GITHUB_EVENT_BEFORE?.trim() || "";
  const after = env.IMAGE_DIFF_HEAD?.trim() || env.GITHUB_SHA?.trim() || "";
  // INT-318: zero `github.event.before` → first parent, not a full rebuild.
  const before = resolveBaseFn(root, rawBefore, after);
  const changed = diffFn(root, before, after);
  if (changed === null) {
    return {
      dockerfiles: allDockerfiles,
      reason: `full (diff base unreachable: before=${before || "(empty)"} head=${after || "(empty)"})`,
    };
  }

  const selected = selectDockerfilesForChangedPaths(changed, allDockerfiles);
  if (selected.length === 0) {
    return {
      dockerfiles: [],
      reason: `skip (${changed.length} path(s); none affect module images)`,
      changed,
    };
  }
  if (selected.length === allDockerfiles.length) {
    return {
      dockerfiles: selected,
      reason: `full (${changed.length} path(s); shared or unscoped change)`,
      changed,
    };
  }
  return {
    dockerfiles: selected,
    reason: `selective (${selected.length}/${allDockerfiles.length}; ${changed.length} path(s))`,
    changed,
  };
}

function logImageSelection(selection) {
  console.log(`INT-183 image selection: ${selection.reason}`);
  if (!selection.changed) return;
  console.log(`Changed paths (${selection.changed.length}):`);
  for (const filePath of selection.changed.slice(0, 50)) {
    console.log(`  - ${filePath}`);
  }
  if (selection.changed.length > 50) {
    console.log(`  … ${selection.changed.length - 50} more`);
  }
}

function dockerLoginGhcr(root, push) {
  if (!push) return;
  const token = process.env.GITHUB_TOKEN;
  const actor = process.env.GITHUB_ACTOR;
  if (!token || !actor) {
    throw new Error("GHCR push requires GITHUB_TOKEN and GITHUB_ACTOR");
  }
  run("docker", ["login", "ghcr.io", "-u", actor, "--password-stdin"], {
    cwd: root,
    input: token,
    stdio: ["pipe", "inherit", "inherit"],
  });
}

function tryDockerRmi(root, tag) {
  try {
    run("docker", ["rmi", "-f", tag], { cwd: root });
  } catch {
    // Image may already be gone; continue with the next module.
  }
}

async function buildScanOneImage(root, dockerfile, repository, sha, push) {
  const source = await readFile(path.join(root, dockerfile), "utf8");
  if (!dockerfileRunsAsNonRoot(source)) {
    throw new Error(`${dockerfile} must set a non-root USER`);
  }
  const tag = `ghcr.io/${repository}/${imageSuffix(dockerfile)}:${sha}`;
  const floating = process.env.IMAGE_FLOATING_TAG?.trim();
  const floatingTag = floating
    ? `ghcr.io/${repository}/${imageSuffix(dockerfile)}:${floating}`
    : null;
  run("docker", ["build", "-f", dockerfile, "-t", tag, "."], { cwd: root });
  if (floatingTag) {
    run("docker", ["tag", tag, floatingTag], { cwd: root });
  }
  run("docker", [
    "run",
    "--rm",
    "-v",
    "/var/run/docker.sock:/var/run/docker.sock",
    "-v",
    `${root}:/work`,
    "-w",
    "/work",
    "ghcr.io/aquasecurity/trivy:0.75.0",
    "image",
    "--config",
    "/work/trivy-image.yaml",
    "--exit-code",
    "1",
    tag,
  ], { cwd: root });
  if (push) {
    run("docker", ["push", tag], { cwd: root });
    if (floatingTag) {
      run("docker", ["push", floatingTag], { cwd: root });
    }
  }
  if (!push) {
    tryDockerRmi(root, tag);
    if (floatingTag) {
      tryDockerRmi(root, floatingTag);
    }
  }
  try {
    run("docker", ["builder", "prune", "-f"], { cwd: root });
  } catch {
    // Older Docker without buildx prune — ignore.
  }
}

async function buildImages(root) {
  const allDockerfiles = await findDockerfiles(root);
  if (allDockerfiles.length === 0) {
    console.log(
      "No module Dockerfile yet. The image build and image scan run when one is added.",
    );
    return;
  }

  const selection = resolveDockerfilesToBuild(root, allDockerfiles);
  logImageSelection(selection);

  const dockerfiles = selection.dockerfiles;
  if (dockerfiles.length === 0) {
    console.log("No module images to build for this push.");
    return;
  }
  console.log(`Building ${dockerfiles.length} image(s):`);
  for (const dockerfile of dockerfiles) {
    console.log(`  - ${imageSuffix(dockerfile)} (${dockerfile})`);
  }

  const repository = (
    process.env.GITHUB_REPOSITORY || "blooo-io/intelligent-eu-billing-and-payment"
  ).toLowerCase();
  const sha = process.env.GITHUB_SHA || "local";
  const push = process.env.IMAGE_PUSH === "true";
  dockerLoginGhcr(root, push);

  for (const dockerfile of dockerfiles) {
    await buildScanOneImage(root, dockerfile, repository, sha, push);
  }
}

if (process.argv[1]?.endsWith("module-images.mjs") && process.argv.includes("--build")) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  await buildImages(root);
}
