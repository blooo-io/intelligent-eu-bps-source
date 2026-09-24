import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

describe("apps/site public docs (INT-299)", () => {
  it("ships VitePress config with GitHub Pages base path", () => {
    const config = readFileSync(path.join(root, ".vitepress/config.mts"), "utf8");
    assert.match(config, /intelligent-eu-billing-and-payment/);
    assert.match(config, /defineConfig/);
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
