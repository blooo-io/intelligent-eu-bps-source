import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("D5.5 release docs point at architecture, contracts and licence (INT-93/94/95)", async () => {
  const index = await readFile("docs/release/README.md", "utf8");
  const deploy = await readFile("docs/release/deployment.md", "utf8");
  const api = await readFile("docs/release/integration-api.md", "utf8");
  const notes = await readFile("docs/release/RELEASE-NOTES.md", "utf8");
  const root = await readFile("README.md", "utf8");

  assert.match(index, /INT-93/);
  assert.match(index, /INT-94/);
  assert.match(index, /INT-95/);
  assert.match(deploy, /05-physical-architecture/);
  assert.match(deploy, /deploy\//);
  assert.match(deploy, /GitOps|Argo/);
  assert.match(api, /openapi\/public\.v1\.yaml/);
  assert.match(api, /asyncapi\//);
  assert.match(api, /contracts\/README/);
  assert.match(notes, /Apache/);
  assert.match(notes, /Stripe test/);
  assert.match(notes, /mocked|mock/i);
  assert.match(root, /docs\/release\//);

  await access("LICENSE");
  await access("NOTICE");
  await access("contracts/openapi/public.v1.yaml");
});

test("INT-92 / INT-359 source release note matches package version 1.0.1", async () => {
  const index = await readFile("docs/release/README.md", "utf8");
  const source = await readFile("docs/release/SOURCE-RELEASE.md", "utf8");
  const notes = await readFile("docs/release/RELEASE-NOTES.md", "utf8");
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  assert.match(index, /INT-92/);
  assert.match(index, /INT-359/);
  assert.match(index, /SOURCE-RELEASE\.md/);
  assert.match(source, /INT-92/);
  assert.match(source, /v1\.0\.0/);
  assert.match(source, /v1\.0\.1/);
  assert.match(source, /never pushed/);
  assert.match(notes, /OpenBao/);
  assert.match(notes, /GPL-3\.0/);
  assert.equal(pkg.version, "1.0.1");
});

test("INT-305 versioning note is linked from the release index", async () => {
  const index = await readFile("docs/release/README.md", "utf8");
  const versioning = await readFile("docs/release/VERSIONING.md", "utf8");
  const deploy = await readFile("docs/release/deployment.md", "utf8");

  assert.match(index, /INT-305/);
  assert.match(index, /VERSIONING\.md/);
  assert.match(versioning, /cut-release\.mjs/);
  assert.match(versioning, /vMAJOR\.MINOR\.PATCH/);
  assert.match(deploy, /VERSIONING\.md|INT-305/);
});

test("INT-96 / INT-97 consistency and freeze notes are linked", async () => {
  const index = await readFile("docs/release/README.md", "utf8");
  const consistency = await readFile("docs/release/PACKAGE-CONSISTENCY.md", "utf8");
  const freeze = await readFile("docs/release/FREEZE.md", "utf8");

  assert.match(index, /INT-96/);
  assert.match(index, /PACKAGE-CONSISTENCY\.md/);
  assert.match(index, /INT-97/);
  assert.match(index, /FREEZE\.md/);
  assert.match(consistency, /62 Pass/);
  assert.match(consistency, /0 Blocked/);
  assert.match(freeze, /v1\.0\.0/);
  assert.match(freeze, /INT-90|INT-91/);
});

test("INT-291 SonarQube quality note is linked", async () => {
  const index = await readFile("docs/release/README.md", "utf8");
  const sonar = await readFile("docs/release/sonarqube.md", "utf8");
  const deploy = await readFile("docs/release/deployment.md", "utf8");

  assert.match(index, /INT-291/);
  assert.match(index, /sonarqube\.md/);
  assert.match(sonar, /SONAR_TOKEN/);
  assert.match(sonar, /qualitygate\.wait/);
  assert.match(deploy, /sonarqube\.md/);
});
