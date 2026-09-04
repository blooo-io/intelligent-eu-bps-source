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
  const last = users[users.length - 1];
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
  let sawNonSkip = false;

  for (const filePath of paths) {
    if (filePath === LOCKFILE_PATH) {
      sawNonSkip = true;
      continue;
    }
    if (isSkipOnlyPath(filePath)) continue;
    sawNonSkip = true;
    const dockerfile = dockerfileForModulePath(filePath);
    if (dockerfile && known.has(dockerfile)) {
      selected.add(dockerfile);
    } else if (!dockerfile) {
      // Unknown layout — rebuild everything rather than miss an image.
      return [...normalizedAll];
    }
  }

  if (lockfileChanged) {
    const lockDecision = lockfileRebuildScope(paths, known);
    if (lockDecision === "all") {
      return [...normalizedAll];
    }
    for (const dockerfile of lockDecision) {
      selected.add(dockerfile);
    }
  }

  if (!sawNonSkip) {
    return [];
  }

  return [...selected].sort((a, b) => a.localeCompare(b));
}

/**
 * INT-185 — interpret pnpm-lock.yaml with companion package.json changes.
 * @returns {"all" | string[]}
 */
export function lockfileRebuildScope(changedPaths, knownDockerfiles) {
  const manifests = changedPaths.filter(
    (p) => p === "package.json" || p.endsWith("/package.json"),
  );

  if (
    manifests.some(
      (p) =>
        p === "package.json" ||
        p.startsWith("packages/") ||
        p.startsWith("services/") ||
        p.startsWith("mocks/"),
    )
  ) {
    return "all";
  }

  const fromApps = [];
  for (const manifest of manifests) {
    const match = manifest.match(/^apps\/([^/]+)\/package\.json$/);
    if (!match) continue;
    const dockerfile = `apps/${match[1]}/Dockerfile`;
    if (knownDockerfiles.has(dockerfile)) fromApps.push(dockerfile);
  }

  // Lockfile + only app manifests (or lockfile + app sources already selected):
  // rebuild those apps. Lockfile with no manifests → rely on module source hits;
  // if none, FULL (unsafe to skip a lockfile-only push).
  if (fromApps.length > 0) return fromApps;
  if (manifests.length === 0) {
    const moduleHits = changedPaths
      .map((p) => dockerfileForModulePath(p))
      .filter((d) => d && knownDockerfiles.has(d));
    if (moduleHits.length > 0) return [...new Set(moduleHits)];
    return "all";
  }
  return "all";
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
  const match = normalized.match(/^(services|apps|mocks)\/([^/]+)\//);
  if (!match) return null;
  return `${match[1]}/${match[2]}/Dockerfile`;
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
 */
export function resolveDockerfilesToBuild(
  root,
  allDockerfiles,
  env = process.env,
  diffFn = listChangedPaths,
) {
  if (env.IMAGE_CHANGED_ONLY !== "true") {
    return { dockerfiles: allDockerfiles, reason: "full (IMAGE_CHANGED_ONLY unset)" };
  }

  const before = env.IMAGE_DIFF_BASE?.trim() || env.GITHUB_EVENT_BEFORE?.trim() || "";
  const after = env.IMAGE_DIFF_HEAD?.trim() || env.GITHUB_SHA?.trim() || "";
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

async function buildImages(root) {
  const allDockerfiles = await findDockerfiles(root);
  if (allDockerfiles.length === 0) {
    console.log(
      "No module Dockerfile yet. The image build and image scan run when one is added.",
    );
    return;
  }

  const selection = resolveDockerfilesToBuild(root, allDockerfiles);
  console.log(`INT-183 image selection: ${selection.reason}`);
  if (selection.changed) {
    console.log(`Changed paths (${selection.changed.length}):`);
    for (const filePath of selection.changed.slice(0, 50)) {
      console.log(`  - ${filePath}`);
    }
    if (selection.changed.length > 50) {
      console.log(`  … ${selection.changed.length - 50} more`);
    }
  }

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
  if (push) {
    const token = process.env.GITHUB_TOKEN;
    const actor = process.env.GITHUB_ACTOR;
    if (!token || !actor) throw new Error("GHCR push requires GITHUB_TOKEN and GITHUB_ACTOR");
    run("docker", ["login", "ghcr.io", "-u", actor, "--password-stdin"], {
      cwd: root,
      input: token,
      stdio: ["pipe", "inherit", "inherit"],
    });
  }

  for (const dockerfile of dockerfiles) {
    const source = await readFile(path.join(root, dockerfile), "utf8");
    if (!dockerfileRunsAsNonRoot(source)) {
      throw new Error(`${dockerfile} must set a non-root USER`);
    }
    const tag = `ghcr.io/${repository}/${imageSuffix(dockerfile)}:${sha}`;
    // INT-178 — also publish a floating tag for Argo on develop (branch
    // protection blocks bot commits that would pin the SHA in Git).
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
    // Free runner disk between modules (INT-107 supply-chain: "No space left on device").
    // Keep the tag only when pushing to GHCR; otherwise drop it after the scan.
    if (!push) {
      try {
        run("docker", ["rmi", "-f", tag], { cwd: root });
      } catch {
        // Image may already be gone; continue with the next module.
      }
      if (floatingTag) {
        try {
          run("docker", ["rmi", "-f", floatingTag], { cwd: root });
        } catch {
          // optional floating tag may already be gone
        }
      }
    }
    try {
      run("docker", ["builder", "prune", "-f"], { cwd: root });
    } catch {
      // Older Docker without buildx prune — ignore.
    }
  }
}

if (process.argv[1]?.endsWith("module-images.mjs") && process.argv.includes("--build")) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  await buildImages(root);
}
