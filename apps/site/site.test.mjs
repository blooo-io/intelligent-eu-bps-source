import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

describe("apps/site public docs (INT-299…INT-302, INT-455)", () => {
  it("ships VitePress config with Mermaid", () => {
    const config = readFileSync(path.join(root, ".vitepress/config.mts"), "utf8");
    assert.match(config, /DOCS_BASE/);
    assert.match(config, /withMermaid/);
    assert.match(config, /INT-455/);
    assert.doesNotMatch(config, /vitepress-openapi/);
    assert.doesNotMatch(config, /public\.v1/);
  });

  it("theme does not load vitepress-openapi (INT-455)", () => {
    const theme = readFileSync(
      path.join(root, ".vitepress/theme/index.ts"),
      "utf8",
    );
    assert.doesNotMatch(theme, /useOpenapi/);
    assert.doesNotMatch(theme, /vitepress-openapi/);
  });

  it("architecture digest keeps a mermaid fence for client render", () => {
    const arch = readFileSync(path.join(root, "reference/architecture.md"), "utf8");
    assert.match(arch, /```mermaid[\s\S]*flowchart LR/);
    assert.match(arch, /\/architecture\/01-functional-architecture/);
    assert.match(arch, /\/architecture\//);
  });

  it("nav and sidebar expose the full architecture section (INT-413)", () => {
    const config = readFileSync(path.join(root, ".vitepress/config.mts"), "utf8");
    assert.match(config, /text:\s*"Architecture"/);
    assert.match(config, /"\/architecture\/"/);
    assert.match(config, /01-functional-architecture/);
    assert.match(config, /05-physical-architecture/);
    assert.match(config, /06-datamodel-ontology/);
    assert.match(config, /07-scenario-flows/);
  });

  it("API page documents EWDS-only integration (INT-455)", () => {
    const apiNotes = readFileSync(path.join(root, "reference/api.md"), "utf8");
    assert.ok(existsSync(path.join(root, "api/index.md")));
    const api = readFileSync(path.join(root, "api/index.md"), "utf8");
    assert.match(api, /INT-455/);
    assert.match(api, /EWDS/);
    assert.doesNotMatch(api, /Try it out/);
    assert.doesNotMatch(apiNotes, /public\.v1\.yaml/);
  });

  it("build-openapi prepare is a no-op after INT-455", () => {
    assert.ok(existsSync(path.join(root, "scripts/build-openapi.mjs")));
    const text = readFileSync(path.join(root, "scripts/build-openapi.mjs"), "utf8");
    assert.match(text, /INT-455/);
    assert.equal(existsSync(path.join(root, "public/openapi/public.v1.json")), false);
  });

  it("links the repository by its current name (INT-369)", () => {
    const sources = [
      "index.md",
      "api/index.md",
      "contribute/index.md",
      "reference/api.md",
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
});

describe("v6.1 wording (INT-437)", () => {
  const pages = [
    "index.md",
    "guide/introduction.md",
    "guide/deploy.md",
    "guide/adapters.md",
    "guide/security.md",
    "guide/what-you-get.md",
    "guide/configuration.md",
    "reference/architecture.md",
  ];
  it("drops retired model terms", () => {
    for (const p of pages) {
      const t = readFileSync(path.join(root, p), "utf8");
      assert.doesNotMatch(
        t,
        /producer is the bank|early settlement|Stripe Invoicing|Stripe is master|your own UI/i,
        p,
      );
    }
  });
  it("explains the EWDS path and the Stripe residency note", () => {
    assert.match(
      readFileSync(path.join(root, "guide/introduction.md"), "utf8"),
      /monthly statement/i,
    );
    assert.match(readFileSync(path.join(root, "guide/adapters.md"), "utf8"), /EWDS/);
    assert.match(
      readFileSync(path.join(root, "guide/security.md"), "utf8"),
      /Stripe Payments Europe/,
    );
  });
});