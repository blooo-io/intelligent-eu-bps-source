import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, afterEach } from "node:test";
import { packagePages, pathPrefixFromBase } from "./package-pages.mjs";

const temps = [];

afterEach(() => {
  while (temps.length) {
    rmSync(temps.pop(), { recursive: true, force: true });
  }
});

function fakeDist() {
  const dir = mkdtempSync(path.join(tmpdir(), "site-dist-"));
  temps.push(dir);
  writeFileSync(path.join(dir, "index.html"), "<html>docs</html>\n");
  mkdirSync(path.join(dir, "assets"), { recursive: true });
  writeFileSync(path.join(dir, "assets", "app.js"), "console.log(1)\n");
  return dir;
}

describe("package-pages (INT-401)", () => {
  it("derives the nested folder from DOCS_BASE", () => {
    assert.equal(pathPrefixFromBase("/intelligent-eu-bps-source/"), "intelligent-eu-bps-source");
    assert.equal(pathPrefixFromBase("intelligent-eu-bps-source"), "intelligent-eu-bps-source");
    assert.equal(pathPrefixFromBase("/"), "");
  });

  it("nests VitePress output and writes root redirect + CNAME", () => {
    const dist = fakeDist();
    const out = mkdtempSync(path.join(tmpdir(), "pages-dist-"));
    temps.push(out);

    const result = packagePages({
      distDir: dist,
      outDir: out,
      docsBase: "/intelligent-eu-bps-source/",
      customDomain: "docs.blooo.dev",
    });

    assert.equal(result.prefix, "intelligent-eu-bps-source");
    assert.ok(existsSync(path.join(out, "intelligent-eu-bps-source", "index.html")));
    assert.ok(existsSync(path.join(out, "intelligent-eu-bps-source", "assets", "app.js")));
    assert.equal(readFileSync(path.join(out, "CNAME"), "utf8").trim(), "docs.blooo.dev");

    const redirect = readFileSync(path.join(out, "index.html"), "utf8");
    assert.match(redirect, /\/intelligent-eu-bps-source\//);
    assert.match(redirect, /location\.replace/);
  });

  it("rejects a root DOCS_BASE (nothing to nest)", () => {
    const dist = fakeDist();
    const out = mkdtempSync(path.join(tmpdir(), "pages-dist-"));
    temps.push(out);
    assert.throws(
      () =>
        packagePages({
          distDir: dist,
          outDir: out,
          docsBase: "/",
          customDomain: "docs.blooo.dev",
        }),
      /non-root path/,
    );
  });
});
