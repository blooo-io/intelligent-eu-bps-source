import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { collectLcovPaths } from "./sonar-lcov-paths.mjs";

// INT-291 — SonarQube quality pipeline packaging.
test("sonar-project.properties packs monorepo key and coverage hooks", async () => {
  const text = await readFile(
    new URL("../sonar-project.properties", import.meta.url),
    "utf8",
  );
  assert.match(text, /sonar\.projectKey=blooo-io_intelligent-eu-billing-and-payment/);
  assert.match(text, /sonar\.organization=blooo-io/);
  assert.match(text, /sonar\.sources=apps,services,packages,scripts/);
  assert.match(text, /javascript\.lcov\.reportPaths/);
  assert.match(text, /INT-291/);
});

test("ci workflow sonarqube job waits on quality gate after coverage", async () => {
  const text = await readFile(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  assert.match(text, /INT-291/);
  assert.match(text, /name:\s*sonarqube/);
  assert.match(text, /needs:\s*\[test\]/);
  assert.match(text, /SonarSource\/sonarqube-scan-action@v5/);
  assert.match(text, /sonar\.qualitygate\.wait=true/);
  assert.match(text, /SONAR_TOKEN/);
  assert.match(text, /SONAR_HOST_URL/);
  assert.match(text, /sonar-lcov-paths\.mjs/);
});

test("manual sonarqube workflow_dispatch entry exists", async () => {
  const text = await readFile(
    new URL("../.github/workflows/sonarqube.yml", import.meta.url),
    "utf8",
  );
  assert.match(text, /name:\s*sonarqube/);
  assert.match(text, /workflow_dispatch:/);
  assert.match(text, /SonarSource\/sonarqube-scan-action@v5/);
  assert.match(text, /sonar\.qualitygate\.wait=true/);
});

test("collectLcovPaths returns relative posix paths", async () => {
  const paths = await collectLcovPaths();
  for (const p of paths) {
    assert.equal(p.includes("\\"), false);
    assert.match(p, /\/coverage\/lcov\.info$/);
  }
});
