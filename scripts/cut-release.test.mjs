import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPackageMatchesVersion,
  assertTagAbsent,
  isSemVer,
  parseArgs,
  tagFromVersion,
  versionFromTag,
} from "./cut-release.mjs";

test("INT-305 parseArgs defaults to dry-run", () => {
  assert.deepEqual(parseArgs([]), {
    dryRun: true,
    push: false,
    version: null,
    help: false,
  });
  assert.equal(parseArgs(["--push"]).push, true);
  assert.equal(parseArgs(["--push"]).dryRun, false);
  assert.throws(() => parseArgs(["--dry-run", "--push"]), /either --dry-run or --push/);
});

test("INT-305 tagFromVersion / versionFromTag round-trip SemVer", () => {
  assert.equal(isSemVer("1.0.0"), true);
  assert.equal(isSemVer("1.0.0-rc.1"), true);
  assert.equal(isSemVer("1.0.0+build.1"), true);
  assert.equal(isSemVer("1"), false);
  assert.equal(isSemVer("01.0.0"), false);
  assert.equal(tagFromVersion("1.0.0"), "v1.0.0");
  assert.equal(tagFromVersion("v1.2.3"), "v1.2.3");
  assert.equal(tagFromVersion("1.0.0-rc.1"), "v1.0.0-rc.1");
  assert.equal(versionFromTag("v1.0.0"), "1.0.0");
  assert.equal(versionFromTag("v1.0.0-rc.1"), "1.0.0-rc.1");
  assert.throws(() => tagFromVersion("1"), /Invalid SemVer/);
  assert.throws(() => versionFromTag("1.0.0"), /must start with "v"/);
});

test("INT-305 package.json must match release version", () => {
  assertPackageMatchesVersion({ version: "1.0.0", packageVersion: "1.0.0" });
  assert.throws(
    () => assertPackageMatchesVersion({ version: "1.0.1", packageVersion: "1.0.0" }),
    /package\.json version/,
  );
});

test("INT-305 refuse to retag an existing tag", () => {
  const run = (cmd, args) => {
    assert.equal(cmd, "git");
    if (args.includes("rev-parse") && args.includes("refs/tags/v1.0.0")) {
      return "deadbeef\n";
    }
    throw new Error(`unexpected: ${args.join(" ")}`);
  };
  assert.throws(() => assertTagAbsent("/tmp", "v1.0.0", run), /already exists/);
});

test("INT-305 assertTagAbsent allows missing tags", () => {
  const run = () => {
    throw new Error("missing");
  };
  assert.equal(assertTagAbsent("/tmp", "v9.9.9", run), undefined);
});
