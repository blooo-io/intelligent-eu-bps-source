import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

describe("apps/site public docs (INT-299…INT-302)", () => {
  it("ships VitePress config with Mermaid and vitepress-openapi sidebar", () => {
    const config = readFileSync(path.join(root, ".vitepress/config.mts"), "utf8");
    assert.match(config, /DOCS_BASE/);
    assert.match(config, /withMermaid/);
    assert.match(config, /useSidebar/);
    assert.match(config, /vitepress-openapi/);
  });

  it("registers vitepress-openapi theme", () => {
    const theme = readFileSync(
      path.join(root, ".vitepress/theme/index.ts"),
      "utf8",
    );
    assert.match(theme, /useOpenapi/);
    assert.match(theme, /vitepress-openapi\/client/);
  });

  it("architecture page keeps a mermaid fence for client render", () => {
    const arch = readFileSync(path.join(root, "reference/architecture.md"), "utf8");
    assert.match(arch, /```mermaid[\s\S]*flowchart LR/);
  });

  it("API pages use vitepress-openapi (not Redoc iframe)", () => {
    const apiNotes = readFileSync(path.join(root, "reference/api.md"), "utf8");
    assert.match(apiNotes, /vitepress-openapi/);
    assert.doesNotMatch(apiNotes, /iframe[\s\S]*\/api\//);
    assert.ok(existsSync(path.join(root, "api/index.md")));
    assert.ok(existsSync(path.join(root, "api/operations/[operationId].md")));
    assert.ok(existsSync(path.join(root, "api/operations/[operationId].paths.js")));
  });

  it("prepares OpenAPI JSON from the contract", () => {
    assert.ok(existsSync(path.join(root, "scripts/build-openapi.mjs")));
    assert.ok(
      existsSync(path.join(root, "public/openapi/public.v1.json")),
      "run openapi:prepare before tests (package test script does)",
    );
    const json = JSON.parse(
      readFileSync(path.join(root, "public/openapi/public.v1.json"), "utf8"),
    );
    assert.equal(json.openapi?.startsWith("3."), true);
    assert.ok(json.paths);
  });

  it("includes adopter-facing guide pages", () => {
    for (const rel of [
      "index.md",
      "guide/introduction.md",
      "guide/deploy.md",
      "guide/configuration.md",
      "guide/adapters.md",
      "guide/docs-hosting.md",
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

  it("documents custom domain vs private Pages host", () => {
    const hosting = readFileSync(path.join(root, "guide/docs-hosting.md"), "utf8");
    assert.match(hosting, /Custom domain/i);
    assert.match(hosting, /pages\.github\.io/);
    assert.match(hosting, /vitepress-openapi/);
  });
});
