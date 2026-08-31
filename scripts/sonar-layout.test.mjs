import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { collectLcovPaths } from "./sonar-lcov-paths.mjs";
import {
  DEFAULT_SCANNER_IMAGE,
  buildDockerArgs,
  buildScannerArgs,
  isSonarCloudHost,
} from "./sonar-scan.mjs";

// INT-291 — SonarQube quality pipeline packaging (Scanner CLI via Docker).
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

test("ci workflow sonarqube job uses Scanner CLI wrapper after coverage", async () => {
  const text = await readFile(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  assert.match(text, /INT-291/);
  assert.match(text, /name:\s*sonarqube/);
  assert.match(text, /needs:\s*\[test\]/);
  assert.match(text, /node scripts\/sonar-scan\.mjs/);
  assert.doesNotMatch(text, /SonarSource\/sonarqube-scan-action/);
  assert.match(text, /SONAR_TOKEN/);
  assert.match(text, /SONAR_HOST_URL/);
  assert.match(text, /sonar-lcov-paths\.mjs/);
});

test("manual sonarqube workflow_dispatch uses Scanner CLI", async () => {
  const text = await readFile(
    new URL("../.github/workflows/sonarqube.yml", import.meta.url),
    "utf8",
  );
  assert.match(text, /name:\s*sonarqube/);
  assert.match(text, /workflow_dispatch:/);
  assert.match(text, /node scripts\/sonar-scan\.mjs/);
  assert.doesNotMatch(text, /SonarSource\/sonarqube-scan-action/);
});

test("isSonarCloudHost detects SonarCloud only", () => {
  assert.equal(isSonarCloudHost("https://sonarcloud.io"), true);
  assert.equal(isSonarCloudHost("https://sonar.intelligent-eu-bp.blooo.dev"), false);
});

test("buildScannerArgs sets PR decoration on SonarCloud", () => {
  const args = buildScannerArgs(
    {
      SONAR_HOST_URL: "https://sonarcloud.io",
      SONAR_ORGANIZATION: "acme",
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_EVENT_PULL_REQUEST_NUMBER: "42",
      GITHUB_HEAD_REF: "feature/x",
      GITHUB_BASE_REF: "develop",
      GITHUB_REPOSITORY: "blooo-io/intelligent-eu-billing-and-payment",
    },
    "services/payments/coverage/lcov.info",
  );
  assert.ok(args.includes("-Dsonar.host.url=https://sonarcloud.io"));
  assert.ok(args.includes("-Dsonar.organization=acme"));
  assert.ok(args.includes("-Dsonar.qualitygate.wait=true"));
  assert.ok(
    args.includes(
      "-Dsonar.javascript.lcov.reportPaths=services/payments/coverage/lcov.info",
    ),
  );
  assert.ok(args.includes("-Dsonar.pullrequest.key=42"));
  assert.ok(args.includes("-Dsonar.pullrequest.branch=feature/x"));
  assert.ok(args.includes("-Dsonar.pullrequest.base=develop"));
  assert.ok(args.includes("-Dsonar.pullrequest.provider=github"));
  assert.ok(
    args.includes(
      "-Dsonar.pullrequest.github.repository=blooo-io/intelligent-eu-billing-and-payment",
    ),
  );
});

test("buildScannerArgs omits PR/branch props for Community Build host", () => {
  const args = buildScannerArgs(
    {
      SONAR_HOST_URL: "https://sonar.intelligent-eu-bp.blooo.dev",
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_EVENT_PULL_REQUEST_NUMBER: "199",
      GITHUB_HEAD_REF: "feature/x",
      GITHUB_BASE_REF: "develop",
      GITHUB_REPOSITORY: "blooo-io/intelligent-eu-billing-and-payment",
    },
    "services/payments/coverage/lcov.info",
  );
  assert.ok(args.includes("-Dsonar.host.url=https://sonar.intelligent-eu-bp.blooo.dev"));
  assert.ok(args.includes("-Dsonar.qualitygate.wait=true"));
  assert.equal(args.some((a) => a.startsWith("-Dsonar.organization=")), false);
  assert.equal(args.some((a) => a.startsWith("-Dsonar.pullrequest.")), false);
  assert.equal(args.some((a) => a.startsWith("-Dsonar.branch.")), false);
});

test("buildScannerArgs sets branch name on SonarCloud push", () => {
  const args = buildScannerArgs({
    SONAR_HOST_URL: "https://sonarcloud.io",
    GITHUB_EVENT_NAME: "push",
    GITHUB_REF_NAME: "develop",
  });
  assert.ok(args.includes("-Dsonar.branch.name=develop"));
  assert.equal(
    args.some((a) => a.startsWith("-Dsonar.pullrequest.")),
    false,
  );
});

test("buildDockerArgs mounts cwd and uses official scanner image", () => {
  const args = buildDockerArgs({ SONAR_TOKEN: "x" }, "a/lcov.info", "/repo");
  assert.equal(args[0], "run");
  assert.ok(args.includes("--rm"));
  assert.ok(args.includes("-e"));
  assert.ok(args.includes("SONAR_TOKEN"));
  assert.ok(args.includes("/repo:/usr/src"));
  assert.ok(args.includes(DEFAULT_SCANNER_IMAGE));
  assert.ok(args.includes("-Dsonar.qualitygate.wait=true"));
});

test("collectLcovPaths returns relative posix paths", async () => {
  const paths = await collectLcovPaths();
  for (const p of paths) {
    assert.equal(p.includes("\\"), false);
    assert.match(p, /\/coverage\/lcov\.info$/);
  }
});
