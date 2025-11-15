import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  dockerfileRunsAsNonRoot,
  findDockerfiles,
  imageSuffix,
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

// INT-107 / INT-99: free runner disk between module image builds.
test("module image build frees tags and builder cache between modules", async () => {
  const text = await readFile(new URL("./module-images.mjs", import.meta.url), "utf8");
  assert.match(text, /docker", \["rmi"/);
  assert.match(text, /builder", "prune"/);
});
