#!/usr/bin/env node
// CI entry point: run every workspace test script and enforce 80% coverage.
import { spawn } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const SKIPPED_TEST_SCRIPTS = new Set([
  "test:coverage",
  "test:watch",
  "test:ui",
  "test:debug",
]);

/** INT-182 — Playwright targets the deployed cluster; never run from PR unit CI. */
function isSkippedTestScript(script) {
  return SKIPPED_TEST_SCRIPTS.has(script) || script === "test:e2e" || script.startsWith("test:e2e:");
}

const thresholds = JSON.parse(
  await readFile(path.join(root, "config/coverage-thresholds.json"), "utf8"),
);
for (const metric of ["statements", "branches", "functions", "lines"]) {
  if (thresholds[metric] !== 80) {
    console.error(`config/coverage-thresholds.json ${metric} must be 80`);
    process.exit(1);
  }
}

const workspaceGlobs = await readWorkspaceGlobs();
const packages = await discoverPackages(workspaceGlobs);
const failures = [];

for (const pkg of packages) {
  const hasSource = await hasExecutableSource(pkg.directory);
  if (!hasSource) continue;

  if (!pkg.scripts["test:coverage"]) {
    failures.push(`${pkg.name} has executable source and no test:coverage script`);
    continue;
  }
  if (!(await usesSharedCoverage(pkg.directory))) {
    failures.push(
      `${pkg.name} must load config/vitest.shared.mjs so the 80% thresholds apply`,
    );
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

// Root script suites run before the early-exit when no module source exists yet.
await run(process.execPath, ["--test", path.join(root, "scripts/commit-attribution.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/test-plan.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/unit-component-evidence.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/integration-scenarios.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/functional-cases.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/nfr-traceability.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/uat-package.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/release-docs.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/deploy-layout.test.mjs")]);






await run(process.execPath, ["--test", path.join(root, "scripts/platform-layout.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/platform-secrets-layout.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/platform-observability-layout.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/platform-cnpg-layout.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/platform-keycloak-layout.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/platform-sonarqube-layout.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/platform-keycloak-realms-layout.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/keycloak-ensure-uat-users.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/platform-temporal-layout.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/platform-apisix-layout.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/platform-apisix-gateway-layout.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/argocd-bootstrap.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/argocd-repo-credentials.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/openbao-dev-bootstrap.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/openbao-seed-dev-placeholders.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/module-images.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/e2e-dev-layout.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/sonar-layout.test.mjs")]);

await run(process.execPath, ["--test", path.join(root, "scripts/pin-dev-image-tag.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/openbao-seed-ghcr-pull.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/openbao-seed-stripe-test.test.mjs")]);
await run(process.execPath, ["--test", path.join(root, "scripts/uat053-seed-numbering.test.mjs")]);


await run(process.execPath, ["--test", path.join(root, "scripts/local-stack.test.mjs")]);

const commands = [];
for (const pkg of packages) {
  const hasSource = await hasExecutableSource(pkg.directory);
  if (hasSource) {
    commands.push([pkg, "test:coverage"]);
  }
  for (const script of Object.keys(pkg.scripts).sort()) {
    if (script !== "test" && !script.startsWith("test:")) continue;
    if (isSkippedTestScript(script)) continue;
    if (script === "test" && pkg.scripts["test:coverage"]) continue;
    if (!hasSource && script === "test:coverage") continue;
    commands.push([pkg, script]);
  }
}

if (commands.length === 0) {
  console.log(
    "No executable workspace yet. The 80% coverage gate is armed for the first module.",
  );
  process.exit(0);
}

await run("corepack", ["enable"]);
await run("corepack", ["prepare", "pnpm@9", "--activate"]);
const installArgs = (await exists(path.join(root, "pnpm-lock.yaml")))
  ? ["install", "--frozen-lockfile"]
  : ["install"];
await run("pnpm", installArgs, root);

// INT-101 — needs workspace ajv from pnpm install (not available in the
// pre-install script suite above).
await run(process.execPath, ["--test", path.join(root, "scripts/validate-ewds-schemas.test.mjs")]);

// INT-102 — workspace packages export dist/; build them before consumers' tests.
for (const pkg of packages) {
  if (pkg.scripts.build && (await hasExecutableSource(pkg.directory))) {
    console.log(`\n== ${pkg.name} build ==`);
    await run("pnpm", ["--dir", pkg.directory, "run", "build"], root);
  }
}

for (const [pkg, script] of commands) {
  console.log(`\n== ${pkg.name} ${script} ==`);
  await run("pnpm", ["--dir", pkg.directory, "run", script], root);
}

async function readWorkspaceGlobs() {
  const raw = await readFile(path.join(root, "pnpm-workspace.yaml"), "utf8");
  return [...raw.matchAll(/^\s*-\s+"([^"]+)"/gm)].map((match) => match[1]);
}

async function discoverPackages(globs) {
  const directories = new Set();
  for (const pattern of globs) {
    if (pattern.endsWith("/*")) {
      const parent = path.join(root, pattern.slice(0, -2));
      if (!(await exists(parent))) continue;
      for (const entry of await readdir(parent, { withFileTypes: true })) {
        if (entry.isDirectory()) directories.add(path.join(parent, entry.name));
      }
    } else {
      directories.add(path.join(root, pattern));
    }
  }

  const packages = [];
  for (const directory of [...directories].sort()) {
    const manifestPath = path.join(directory, "package.json");
    if (!(await exists(manifestPath))) continue;
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    packages.push({
      name: manifest.name ?? path.relative(root, directory),
      directory,
      scripts: manifest.scripts ?? {},
    });
  }
  return packages;
}

async function hasExecutableSource(directory) {
  const sourceRoot = path.join(directory, "src");
  if (!(await exists(sourceRoot))) return false;
  return walk(sourceRoot);
}

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "coverage" || entry.name === "dist") continue;
      if (await walk(fullPath)) return true;
      continue;
    }
    const extension = path.extname(entry.name);
    if (!SOURCE_EXTENSIONS.has(extension) || entry.name.endsWith(".d.ts")) continue;
    if (/\.(spec|test)\.[cm]?[jt]sx?$/.test(entry.name)) continue;
    return true;
  }
  return false;
}

async function usesSharedCoverage(directory) {
  for (const name of ["vitest.config.ts", "vitest.config.mts", "vitest.config.mjs"]) {
    const configPath = path.join(directory, name);
    if (!(await exists(configPath))) continue;
    const source = await readFile(configPath, "utf8");
    if (source.includes("config/vitest.shared.mjs")) return true;
  }
  return false;
}

function exists(filePath) {
  return stat(filePath).then(
    () => true,
    () => false,
  );
}

function run(command, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}
