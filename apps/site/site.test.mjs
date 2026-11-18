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

  it("registers vitepress-openapi theme with custom server option", () => {
    const theme = readFileSync(
      path.join(root, ".vitepress/theme/index.ts"),
      "utf8",
    );
    assert.match(theme, /useOpenapi/);
    assert.match(theme, /vitepress-openapi\/client/);
    assert.match(theme, /allowCustomServer/);
    // INT-407 — plain-string auth so Try it out rebuilds Authorization.
    assert.match(theme, /persistAuth:\s*false/);
    // INT-403 — token helper for /api/.
    assert.match(theme, /ApiTokenHelper/);
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

  it("prepares OpenAPI JSON with absolute sample API server", () => {
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
    const urls = (json.servers || []).map((s) => s.url);
    assert.ok(
      urls.includes("https://api.dev.intelligent-eu-bp.blooo.dev/v1"),
      `expected sample gateway in servers, got ${JSON.stringify(urls)}`,
    );
    // INT-408 — security scheme must be inlined (no external file $ref) or Try it
    // out never attaches Authorization.
    const bearer = json.components?.securitySchemes?.bearerAuth;
    assert.equal(bearer?.type, "http", JSON.stringify(bearer));
    assert.equal(bearer?.scheme, "bearer");
    assert.equal(bearer?.$ref, undefined);
    // Downloadable YAML stays contract-faithful (relative /v1 only).
    const yaml = readFileSync(
      path.join(root, "public/openapi/public.v1.yaml"),
      "utf8",
    );
    assert.match(yaml, /url:\s*\/v1/);
    assert.doesNotMatch(yaml, /api\.dev\.intelligent-eu-bp/);
  });

  it("links the repository by its current name (INT-369)", () => {
    const sources = [
      "index.md",
      "api/index.md",
      "contribute/index.md",
      "reference/api.md",
      "reference/architecture.md",
      "guide/quick-start.md",
      "guide/introduction.md",
      "guide/deploy.md",
      "guide/adapters.md",
      ".vitepress/config.mts",
    ];
    for (const file of sources) {
      const text = readFileSync(path.join(root, file), "utf8");
      assert.doesNotMatch(text, /intelligent-eu-billing-and-payment/, file);
    }
    const config = readFileSync(path.join(root, ".vitepress/config.mts"), "utf8");
    assert.match(config, /github\.com\/blooo-io\/intelligent-eu-bps-source/);
  });

  it("prefixes the raw OpenAPI nav link with the Pages base (INT-370)", () => {
    const config = readFileSync(path.join(root, ".vitepress/config.mts"), "utf8");
    assert.match(config, /const rawOpenApi = `\$\{base\}openapi\/public\.v1\.yaml`/);
    assert.doesNotMatch(config, /link:\s*"\/openapi\/public\.v1\.yaml"/);
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

  it("documents Blooo canonical URL on intelligent.docs.blooo.dev (INT-401)", () => {
    const hosting = readFileSync(path.join(root, "guide/docs-hosting.md"), "utf8");
    assert.match(hosting, /https:\/\/intelligent\.docs\.blooo\.dev\//);
    assert.match(hosting, /package-pages\.mjs/);
    assert.ok(existsSync(path.join(root, "scripts/package-pages.mjs")));
  });

  it("API page documents password-grant token flow without publishing credentials (INT-403 / INT-404)", () => {
    const api = readFileSync(path.join(root, "api/index.md"), "utf8");
    assert.match(api, /<ApiTokenHelper\s*\/>/);
    assert.match(api, /grant_type=password/);
    assert.match(api, /client_id=docs/);
    assert.match(api, /username=<username>/);
    assert.match(api, /password=<password>/);
    // INT-404 — no UAT passwords or fixture usernames on the public docs page.
    assert.doesNotMatch(api, /Intelligent-UAT-2026!/);
    assert.doesNotMatch(api, /hugo\.petit/);
    assert.doesNotMatch(api, /sofia\.garcia/);
    assert.doesNotMatch(api, /paul\.nguyen/);
    const helper = readFileSync(
      path.join(root, ".vitepress/theme/ApiTokenHelper.vue"),
      "utf8",
    );
    assert.match(helper, /username = ref\(""\)/);
    assert.match(helper, /password = ref\(""\)/);
    assert.match(helper, /maxFailures/);
    assert.match(helper, /armCooldown/);
    // INT-406 / INT-407 — helper exposes a Bearer-prefixed value for Try it out.
    assert.match(helper, /Bearer \$\{json\.access_token\}/);
    assert.match(api, /INT-407/);
    assert.match(api, /INT-408/);
    const theme = readFileSync(
      path.join(root, ".vitepress/theme/index.ts"),
      "utf8",
    );
    assert.match(theme, /persistAuth:\s*false/);
    // INT-408 — pin: 0.2.14+ breaks vitepress build (`useData` export) on 1.6.x (INT-412).
    assert.match(
      readFileSync(path.join(root, "package.json"), "utf8"),
      /"vitepress-openapi":\s*"0\.2\.12"/,
    );
  });
});
