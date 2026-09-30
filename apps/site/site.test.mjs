import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

describe("apps/site public docs (INT-299)", () => {
  it("ships VitePress config with overridable DOCS_BASE and Mermaid", () => {
    const config = readFileSync(path.join(root, ".vitepress/config.mts"), "utf8");
    assert.match(config, /DOCS_BASE/);
    assert.match(config, /withMermaid/);
    // Private Pages unique host is served at /; project-pages path is opt-in via env.
    assert.match(config, /process\.env\.DOCS_BASE/);
  });

  it("architecture page keeps a mermaid fence for client render", () => {
    const arch = readFileSync(path.join(root, "reference/architecture.md"), "utf8");
    assert.match(arch, /```mermaid[\s\S]*flowchart LR/);
  });

  it("API page embeds the in-site Redoc explorer", () => {
    const api = readFileSync(path.join(root, "reference/api.md"), "utf8");
    assert.match(api, /src="\/api\/"/);
    assert.match(api, /public\.v1\.yaml/);
    assert.match(api, /build-api|INT-301|embedded|\/api\//);
  });

  it("ships build-api script for Redoc merge", () => {
    assert.ok(existsSync(path.join(root, "scripts/build-api.mjs")));
    const script = readFileSync(path.join(root, "scripts/build-api.mjs"), "utf8");
    assert.match(script, /build-docs/);
    assert.match(script, /public\.v1\.yaml/);
  });

  it("documents custom domain vs private Pages host", () => {
    const hosting = readFileSync(path.join(root, "guide/docs-hosting.md"), "utf8");
    assert.match(hosting, /Custom domain/i);
    assert.match(hosting, /pages\.github\.io/);
  });

  it("includes adopter-facing guide pages", () => {
    for (const rel of [
      "index.md",
      "guide/introduction.md",
      "guide/deploy.md",
      "guide/configuration.md",
      "guide/adapters.md",
      "contribute/index.md",
      "contribute/upstream-maintainers.md",
    ]) {
      assert.ok(existsSync(path.join(root, rel)), `missing ${rel}`);
    }
  });

  it("deploy guide does not require Blooo DNS", () => {
    const deploy = readFileSync(path.join(root, "guide/deploy.md"), "utf8");
    assert.match(deploy, /Bring your own|your own|you control|Your substitute/i);
    assert.doesNotMatch(
      deploy,
      /must use Scaleway|required to use Argo|Jira project/,
    );
  });
});
