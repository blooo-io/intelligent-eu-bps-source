import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  dockerfileForModulePath,
  dockerfileRunsAsNonRoot,
  findDockerfiles,
  imageSuffix,
  isGlobalImageRebuildPath,
  isSkipOnlyPath,
  listChangedPaths,
  resolveDockerfilesToBuild,
  selectDockerfilesForChangedPaths,
} from "./module-images.mjs";

test("finds Dockerfiles in the module workspace only", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "int-99-"));
  await mkdir(path.join(root, "services", "participants"), { recursive: true });
  await mkdir(path.join(root, "docs"), { recursive: true });
  await mkdir(path.join(root, "services", "participants", "node_modules", "pkg"), {
    recursive: true,
  });
  await writeFile(path.join(root, "services", "participants", "Dockerfile"), "FROM node\n");
  await writeFile(path.join(root, "docs", "Dockerfile"), "FROM scratch\n");
  await writeFile(
    path.join(root, "services", "participants", "node_modules", "pkg", "Dockerfile"),
    "FROM scratch\n",
  );

  assert.deepEqual(await findDockerfiles(root), ["services/participants/Dockerfile"]);
});

test("names an image from its workspace path", () => {
  assert.equal(imageSuffix("services/participants/Dockerfile"), "services-participants");
  assert.equal(imageSuffix("Dockerfile"), "workspace");
});

test("requires the last USER to be non-root", () => {
  assert.equal(dockerfileRunsAsNonRoot("FROM node:22\nUSER node\n"), true);
  assert.equal(dockerfileRunsAsNonRoot('FROM node:22\nUSER "node"\n'), true);
  assert.equal(dockerfileRunsAsNonRoot("FROM node:22\nUSER node\nUSER root\n"), false);
  assert.equal(dockerfileRunsAsNonRoot("FROM node:22\n"), false);
});

test("Dependabot updates npm and GitHub Actions", async () => {
  const text = await readFile(new URL("../.github/dependabot.yml", import.meta.url), "utf8");
  assert.match(text, /package-ecosystem:\s*"npm"/);
  assert.match(text, /package-ecosystem:\s*"github-actions"/);
});

test("Trivy forbids the excluded licence families", async () => {
  const text = await readFile(new URL("../trivy.yaml", import.meta.url), "utf8");
  for (const id of ["GPL-2.0", "GPL-3.0", "LGPL-3.0", "AGPL-3.0", "SSPL-1.0", "BUSL-1.1"]) {
    assert.match(text, new RegExp(`- ${id}`));
  }
});

// INT-156: image scan is vuln-only; OS GPL packages are not TP-2 app deps.
test("image Trivy config scans vulnerabilities only", async () => {
  const text = await readFile(new URL("../trivy-image.yaml", import.meta.url), "utf8");
  assert.match(text, /scanners:\s*\n\s*- vuln/);
  assert.equal(text.includes("- license"), false);
});

// INT-156: the factory CD smoke Dockerfile must be discoverable and non-root.
test("cd-smoke Dockerfile is discovered and runs as non-root", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dockerfiles = await findDockerfiles(root);
  assert.ok(
    dockerfiles.includes("services/cd-smoke/Dockerfile"),
    `expected services/cd-smoke/Dockerfile in ${JSON.stringify(dockerfiles)}`,
  );
  const source = await readFile(path.join(root, "services/cd-smoke/Dockerfile"), "utf8");
  assert.equal(dockerfileRunsAsNonRoot(source), true);
  assert.equal(imageSuffix("services/cd-smoke/Dockerfile"), "services-cd-smoke");
  assert.match(source, /nodejs22-debian13:nonroot/);
  assert.equal(source.includes("nodejs22-debian12"), false);
});

// INT-137: AC-01 web image is discoverable as apps-web and runs non-root.
test("apps/web Dockerfile is discovered and runs as non-root", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dockerfiles = await findDockerfiles(root);
  assert.ok(
    dockerfiles.includes("apps/web/Dockerfile"),
    `expected apps/web/Dockerfile in ${JSON.stringify(dockerfiles)}`,
  );
  const source = await readFile(path.join(root, "apps/web/Dockerfile"), "utf8");
  assert.equal(dockerfileRunsAsNonRoot(source), true);
  assert.equal(imageSuffix("apps/web/Dockerfile"), "apps-web");
  assert.match(source, /nodejs22-debian13:nonroot/);
});

// INT-107 / INT-99: free runner disk between module image builds.
test("module image build frees tags and builder cache between modules", async () => {
  const text = await readFile(new URL("./module-images.mjs", import.meta.url), "utf8");
  assert.match(text, /docker", \["rmi"/);
  assert.match(text, /builder", "prune"/);
});

// INT-178: floating :develop tag for Argo when IMAGE_FLOATING_TAG is set.
test("module image build can push a floating tag alongside the SHA", async () => {
  const text = await readFile(new URL("./module-images.mjs", import.meta.url), "utf8");
  assert.match(text, /IMAGE_FLOATING_TAG/);
  assert.match(text, /floatingTag/);
});

const ALL = [
  "apps/web/Dockerfile",
  "services/cd-smoke/Dockerfile",
  "services/participants/Dockerfile",
  "services/payments/Dockerfile",
];

// INT-183: path → image selection
test("selectDockerfilesForChangedPaths rebuilds only apps-web for web paths", () => {
  assert.deepEqual(
    selectDockerfilesForChangedPaths(
      ["apps/web/src/App.tsx", "apps/web/src/auth/protected-outlet.tsx"],
      ALL,
    ),
    ["apps/web/Dockerfile"],
  );
});

test("selectDockerfilesForChangedPaths rebuilds one service for its tree", () => {
  assert.deepEqual(
    selectDockerfilesForChangedPaths(["services/participants/src/main.ts"], ALL),
    ["services/participants/Dockerfile"],
  );
});

test("selectDockerfilesForChangedPaths rebuilds all on lockfile or packages change", () => {
  assert.deepEqual(
    selectDockerfilesForChangedPaths(["pnpm-lock.yaml"], ALL),
    ALL,
  );
  assert.deepEqual(
    selectDockerfilesForChangedPaths(["packages/module-template/src/index.ts"], ALL),
    ALL,
  );
  assert.deepEqual(
    selectDockerfilesForChangedPaths(["config/coverage-thresholds.json"], ALL),
    ALL,
  );
});

test("selectDockerfilesForChangedPaths skips docs/deploy/contracts-only pushes", () => {
  assert.deepEqual(
    selectDockerfilesForChangedPaths(
      ["docs/testing/v1-test-plan.md", "deploy/envs/dev/values.yaml", "contracts/openapi/public.v1.yaml"],
      ALL,
    ),
    [],
  );
});

test("selectDockerfilesForChangedPaths unions multiple module hits", () => {
  assert.deepEqual(
    selectDockerfilesForChangedPaths(
      ["apps/web/src/main.tsx", "services/payments/src/main.ts"],
      ALL,
    ),
    ["apps/web/Dockerfile", "services/payments/Dockerfile"],
  );
});

test("dockerfileForModulePath and path classifiers", () => {
  assert.equal(dockerfileForModulePath("apps/web/src/App.tsx"), "apps/web/Dockerfile");
  assert.equal(dockerfileForModulePath("services/foo/bar.ts"), "services/foo/Dockerfile");
  assert.equal(dockerfileForModulePath("docs/readme.md"), null);
  assert.equal(isGlobalImageRebuildPath("pnpm-lock.yaml"), true);
  assert.equal(isGlobalImageRebuildPath("apps/web/src/x.ts"), false);
  assert.equal(isSkipOnlyPath("deploy/charts/web/values.yaml"), true);
  assert.equal(isSkipOnlyPath("apps/web/src/x.ts"), false);
});

test("listChangedPaths returns null for zero/missing base", () => {
  assert.equal(listChangedPaths("/tmp", "0000000000000000000000000000000000000000", "abc"), null);
  assert.equal(listChangedPaths("/tmp", "", "abc"), null);
  const missing = listChangedPaths("/tmp", "deadbeef", "abc", () => {
    throw new Error("missing");
  });
  assert.equal(missing, null);
});

test("listChangedPaths parses git diff output", () => {
  const paths = listChangedPaths("/repo", "aaa", "bbb", (_root, args) => {
    if (args[0] === "cat-file") return "";
    assert.deepEqual(args.slice(0, 3), ["diff", "--name-only", "--diff-filter=ACMRD"]);
    return "apps/web/src/App.tsx\nservices/participants/src/x.ts\n";
  });
  assert.deepEqual(paths, ["apps/web/src/App.tsx", "services/participants/src/x.ts"]);
});

test("resolveDockerfilesToBuild honours IMAGE_CHANGED_ONLY", () => {
  const full = resolveDockerfilesToBuild("/repo", ALL, {});
  assert.equal(full.dockerfiles.length, ALL.length);
  assert.match(full.reason, /full/);

  const unreachable = resolveDockerfilesToBuild(
    "/repo",
    ALL,
    { IMAGE_CHANGED_ONLY: "true", IMAGE_DIFF_BASE: "aaa", IMAGE_DIFF_HEAD: "bbb" },
    () => null,
  );
  assert.equal(unreachable.dockerfiles.length, ALL.length);
  assert.match(unreachable.reason, /unreachable/);

  const selective = resolveDockerfilesToBuild(
    "/repo",
    ALL,
    { IMAGE_CHANGED_ONLY: "true", IMAGE_DIFF_BASE: "aaa", IMAGE_DIFF_HEAD: "bbb" },
    () => ["apps/web/src/App.tsx"],
  );
  assert.deepEqual(selective.dockerfiles, ["apps/web/Dockerfile"]);
  assert.match(selective.reason, /selective/);

  const skip = resolveDockerfilesToBuild(
    "/repo",
    ALL,
    { IMAGE_CHANGED_ONLY: "true", IMAGE_DIFF_BASE: "aaa", IMAGE_DIFF_HEAD: "bbb" },
    () => ["docs/readme.md"],
  );
  assert.deepEqual(skip.dockerfiles, []);
  assert.match(skip.reason, /skip/);
});
