import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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
