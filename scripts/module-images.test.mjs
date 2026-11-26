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
  resolveImageDiffBase,
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
  // INT-323 — keep Nest / React pairs in one PR (solo major bumps break CI).
  assert.match(text, /groups:\s*\n\s*nestjs:/);
  assert.match(text, /patterns:\s*\n\s*-\s*"@nestjs\/\*"/);
  assert.match(text, /groups:[\s\S]*react:[\s\S]*-\s*"react-dom"/);
  // INT-410 — enough concurrent PRs to drain the advisory backlog.
  assert.match(text, /open-pull-requests-limit:\s*15/);
  assert.match(text, /interval:\s*"daily"/);
  // INT-412 — hold breaking majors until coverage/docs are ready.
  assert.match(text, /dependency-name:\s*"vitest"/);
  assert.match(text, /dependency-name:\s*"@vitejs\/plugin-react"/);
  assert.match(text, /dependency-name:\s*"vitepress-openapi"/);
  assert.match(text, /versions:\s*\[[^\]]*>?=0\.2\.13/);
});

test("INT-410/INT-412 Dependabot auto-merge squash-merges only after CI success", async () => {
  const text = await readFile(
    new URL("../.github/workflows/dependabot-automerge.yml", import.meta.url),
    "utf8",
  );
  assert.match(text, /workflow_run:/);
  assert.match(text, /workflows:\s*\[["']ci["']\]/);
  assert.match(text, /conclusion == 'success'/);
  assert.match(text, /event == 'pull_request'/);
  assert.match(text, /dependabot\[bot\]/);
  assert.match(text, /gh pr merge --squash --delete-branch/);
  assert.equal(text.includes("gh pr merge --auto"), false);
});


test("INT-418 pnpm overrides pin vitest 4.1.12 (patched mocker CVEs; avoid vitest 5 coverage drop)", async () => {
  const pkg = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(pkg.pnpm.overrides.vitest, "4.1.12");
  assert.equal(pkg.pnpm.overrides["@vitest/coverage-v8"], "4.1.12");
  assert.equal(pkg.pnpm.overrides["@vitest/mocker"], "4.1.12");
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

// INT-321: Trivy DB mirror 404s must not fail a full republish on first flake.
test("module image Trivy scan uses runWithRetries", async () => {
  const text = await readFile(new URL("./module-images.mjs", import.meta.url), "utf8");
  assert.match(text, /INT-321/);
  assert.match(
    text,
    /runWithRetries\(\s*"docker",\s*\[[^\]]*trivy:0\.75\.0[^\]]*\]/s,
  );
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
  // INT-420 — vitest must not be installed in the image (npm arborist edgesOut crash).
  assert.match(source, /delete p\.devDependencies\?\.vitest/);
  assert.match(source, /INT-420/);
});


// INT-244: developer API portal image is discoverable as apps-docs-portal.
test("apps/docs-portal Dockerfile is discovered and runs as non-root", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dockerfiles = await findDockerfiles(root);
  assert.ok(
    dockerfiles.includes("apps/docs-portal/Dockerfile"),
    `expected apps/docs-portal/Dockerfile in ${JSON.stringify(dockerfiles)}`,
  );
  const source = await readFile(
    path.join(root, "apps/docs-portal/Dockerfile"),
    "utf8",
  );
  assert.equal(dockerfileRunsAsNonRoot(source), true);
  assert.equal(imageSuffix("apps/docs-portal/Dockerfile"), "apps-docs-portal");
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
  "apps/docs-portal/Dockerfile",
  "services/cd-smoke/Dockerfile",
  "services/participants/Dockerfile",
  "services/payments/Dockerfile",
];

test("selectDockerfilesForChangedPaths rebuilds one service for its tree", () => {
  assert.deepEqual(
    selectDockerfilesForChangedPaths(["services/participants/src/main.ts"], ALL),
    ["services/participants/Dockerfile"],
  );
});

test("selectDockerfilesForChangedPaths rebuilds all on packages or config change", () => {
  assert.deepEqual(
    selectDockerfilesForChangedPaths(["packages/module-template/src/index.ts"], ALL),
    ALL,
  );
  assert.deepEqual(
    selectDockerfilesForChangedPaths(["config/coverage-thresholds.json"], ALL),
    ALL,
  );
});

test("INT-455 apps/site has no Dockerfile so tree changes force full rebuild", () => {
  assert.deepEqual(
    selectDockerfilesForChangedPaths(["apps/site/index.md"], ALL),
    ALL,
  );
});

test("selectDockerfilesForChangedPaths rebuilds all when lockfile pairs with a service package.json", () => {
  assert.deepEqual(
    selectDockerfilesForChangedPaths(
      ["services/participants/package.json", "pnpm-lock.yaml"],
      ALL,
    ),
    ALL,
  );
});

test("selectDockerfilesForChangedPaths skips docs/deploy/contracts/scripts pushes", () => {
  assert.deepEqual(
    selectDockerfilesForChangedPaths(
      [
        "docs/testing/v1-test-plan.md",
        "deploy/envs/dev/values.yaml",
        "contracts/openapi/components/schemas.yaml",
        "scripts/run-tests.mjs",
      ],
      ALL,
    ),
    [],
  );
});

test("selectDockerfilesForChangedPaths unions multiple module hits", () => {
  assert.deepEqual(
    selectDockerfilesForChangedPaths(
      ["apps/docs-portal/public/index.html", "services/payments/src/main.ts"],
      ALL,
    ),
    ["apps/docs-portal/Dockerfile", "services/payments/Dockerfile"],
  );
});

// INT-435 — services that depend on @intelligent/ewds-client must COPY it
// into the image build context (otherwise `tsc` fails in supply-chain).
test("Dockerfiles for ewds-client consumers COPY packages/ewds-client", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const consumers = [
    "services/compliance",
    "services/participants",
    "services/publication",
    "services/reference-data",
    // INT-440 — MARKET_ADAPTER=ewds pulls ewds-client into trade-intake.
    "services/trade-intake",
  ];
  for (const dir of consumers) {
    const pkg = JSON.parse(
      await readFile(path.join(root, dir, "package.json"), "utf8"),
    );
    assert.equal(
      pkg.dependencies?.["@intelligent/ewds-client"],
      "workspace:*",
      `${dir} should depend on ewds-client`,
    );
    const dockerfile = await readFile(path.join(root, dir, "Dockerfile"), "utf8");
    assert.match(
      dockerfile,
      /COPY packages\/ewds-client\/package\.json packages\/ewds-client\//,
      `${dir}/Dockerfile missing ewds-client package.json COPY`,
    );
    assert.match(
      dockerfile,
      /COPY packages\/ewds-client packages\/ewds-client/,
      `${dir}/Dockerfile missing ewds-client sources COPY`,
    );
    // INT-438 — emit JS into dist/ before deploy; Node 22 cannot strip .ts under node_modules.
    assert.match(
      dockerfile,
      /pnpm --filter @intelligent\/ewds-client build/,
      `${dir}/Dockerfile must build ewds-client before deploy`,
    );
  }
});

test("INT-438 ewds-client package exports compiled dist (not raw .ts)", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const pkg = JSON.parse(
    await readFile(path.join(root, "packages/ewds-client/package.json"), "utf8"),
  );
  assert.equal(pkg.main, "./dist/index.js");
  assert.equal(pkg.exports["."].import, "./dist/index.js");
  assert.equal(pkg.scripts.build, "tsc -p tsconfig.build.json");
  assert.deepEqual(pkg.files, ["dist", "schemas", "sql"]);
});

// INT-436 — participants mock ActorSource imports @intelligent/mocks fixtures.
test("Dockerfiles for mocks consumers COPY mocks/", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const consumers = [
    "services/participants",
    "services/publication",
    "services/reference-data",
    "services/settlement",
    "services/trade-intake",
  ];
  for (const dir of consumers) {
    const pkg = JSON.parse(
      await readFile(path.join(root, dir, "package.json"), "utf8"),
    );
    assert.equal(
      pkg.dependencies?.["@intelligent/mocks"],
      "workspace:*",
      `${dir} should depend on mocks`,
    );
    const dockerfile = await readFile(path.join(root, dir, "Dockerfile"), "utf8");
    assert.match(
      dockerfile,
      /COPY mocks\/package\.json mocks\//,
      `${dir}/Dockerfile missing mocks package.json COPY`,
    );
    assert.match(
      dockerfile,
      /COPY mocks mocks/,
      `${dir}/Dockerfile missing mocks sources COPY`,
    );
  }
});

test("dockerfileForModulePath and path classifiers", () => {
  assert.equal(
    dockerfileForModulePath("apps/docs-portal/public/index.html"),
    "apps/docs-portal/Dockerfile",
  );
  assert.equal(dockerfileForModulePath("services/foo/bar.ts"), "services/foo/Dockerfile");
  assert.equal(dockerfileForModulePath("docs/readme.md"), null);
  assert.equal(isGlobalImageRebuildPath("pnpm-lock.yaml"), false);
  assert.equal(isGlobalImageRebuildPath("scripts/module-images.mjs"), false);
  assert.equal(isGlobalImageRebuildPath(".trivyignore"), true);
  assert.equal(isGlobalImageRebuildPath("apps/site/foo.md"), false);
  assert.equal(isSkipOnlyPath("deploy/envs/dev/values.yaml"), true);
  assert.equal(isSkipOnlyPath("scripts/run-tests.mjs"), true);
  assert.equal(isSkipOnlyPath("scripts/module-images.mjs"), true);
  assert.equal(isSkipOnlyPath("apps/docs-portal/public/index.html"), false);
});

test("listChangedPaths returns null for zero/missing base", () => {
  assert.equal(listChangedPaths("/tmp", "0000000000000000000000000000000000000000", "abc"), null);
  assert.equal(listChangedPaths("/tmp", "", "abc"), null);
  const missing = listChangedPaths("/tmp", "deadbeef", "abc", () => {
    throw new Error("missing");
  });
  assert.equal(missing, null);
});

test("resolveImageDiffBase keeps a real before and falls back on zero (INT-318)", () => {
  assert.equal(
    resolveImageDiffBase("/repo", "abc123", "def456", () => {
      throw new Error("must not call git");
    }),
    "abc123",
  );
  assert.equal(
    resolveImageDiffBase(
      "/repo",
      "0000000000000000000000000000000000000000",
      "def456",
      (_root, args) => {
        assert.deepEqual(args, ["rev-parse", "--verify", "def456^"]);
        return "parentsha\n";
      },
    ),
    "parentsha",
  );
  assert.equal(
    resolveImageDiffBase("/repo", "", "def456", () => {
      throw new Error("no parent");
    }),
    "",
  );
});

test("listChangedPaths parses git diff output", () => {
  const paths = listChangedPaths("/repo", "aaa", "bbb", (_root, args) => {
    if (args[0] === "cat-file") return "";
    assert.deepEqual(args.slice(0, 3), ["diff", "--name-only", "--diff-filter=ACMRD"]);
    return "apps/site/index.md\nservices/participants/src/x.ts\n";
  });
  assert.deepEqual(paths, ["apps/site/index.md", "services/participants/src/x.ts"]);
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
    () => ["services/participants/src/main.ts"],
  );
  assert.deepEqual(selective.dockerfiles, ["services/participants/Dockerfile"]);
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

test("resolveDockerfilesToBuild uses parent when before is zero (INT-318)", () => {
  const zeros = "0000000000000000000000000000000000000000";
  const skip = resolveDockerfilesToBuild(
    "/repo",
    ALL,
    { IMAGE_CHANGED_ONLY: "true", IMAGE_DIFF_BASE: zeros, IMAGE_DIFF_HEAD: "tipsha" },
    (_root, before, after) => {
      assert.equal(before, "parentsha");
      assert.equal(after, "tipsha");
      // scripts-only tip (same class as INT-317) must not rebuild images
      return ["docs/testing/ewds-project-path-e2e.md", "scripts/stripe-fresh-billing-run.mjs"];
    },
    () => "parentsha",
  );
  assert.deepEqual(skip.dockerfiles, []);
  assert.match(skip.reason, /skip/);
});
