#!/usr/bin/env node
// Discover module Dockerfiles and, when asked, build and scan their images.
import { execFileSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const IMAGE_ROOTS = ["services", "apps", "packages", "mocks"];

export async function findDockerfiles(root) {
  const found = [];
  if (await exists(path.join(root, "Dockerfile"))) found.push("Dockerfile");
  for (const directory of IMAGE_ROOTS) {
    await walk(root, directory, found);
  }
  return found.sort();
}

export function imageSuffix(relativeDockerfile) {
  const normalized = relativeDockerfile.split(path.sep).join("/");
  if (normalized === "Dockerfile") return "workspace";
  return normalized.replace(/\/Dockerfile$/, "").replaceAll("/", "-");
}

export function dockerfileRunsAsNonRoot(source) {
  const users = [...source.matchAll(/^\s*USER\s+(?:"([^"]+)"|(\S+))/gm)].map(
    (match) => match[1] ?? match[2],
  );
  if (users.length === 0) return false;
  const last = users[users.length - 1];
  return last !== "root" && last !== "0";
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

async function buildImages(root) {
  const dockerfiles = await findDockerfiles(root);
  if (dockerfiles.length === 0) {
    console.log(
      "No module Dockerfile yet. The image build and image scan run when one is added.",
    );
    return;
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
