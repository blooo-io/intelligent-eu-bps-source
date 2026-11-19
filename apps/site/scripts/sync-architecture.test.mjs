import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const archDir = path.join(siteRoot, "architecture");

describe("sync-architecture (INT-413)", () => {
  it("publishes the five architecture views plus EWDS note into apps/site/architecture", () => {
    const result = spawnSync(process.execPath, [path.join(here, "sync-architecture.mjs")], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    for (const rel of [
      "index.md",
      "01-functional-architecture.md",
      "02-logical-architecture.md",
      "03-application-architecture.md",
      "04-technical-architecture.md",
      "05-physical-architecture.md",
      "ewds-client-gateway.md",
      "ewds-topics.md",
    ]) {
      assert.ok(existsSync(path.join(archDir, rel)), `missing ${rel}`);
    }

    const overview = readFileSync(path.join(archDir, "index.md"), "utf8");
    assert.match(overview, /01-functional-architecture/);
    assert.match(overview, /Published from the repository/);
    assert.match(overview, /editLink:\s*false/);

    const functional = readFileSync(
      path.join(archDir, "01-functional-architecture.md"),
      "utf8",
    );
    // Peer README.md links become the architecture overview route.
    assert.match(functional, /\]\(\.\/\)/);
    assert.doesNotMatch(functional, /\]\(README\.md\)/);

    const physical = readFileSync(
      path.join(archDir, "05-physical-architecture.md"),
      "utf8",
    );
    assert.match(physical, /```mermaid/);

    const gateway = readFileSync(
      path.join(archDir, "ewds-client-gateway.md"),
      "utf8",
    );
    assert.match(
      gateway,
      /github\.com\/blooo-io\/intelligent-eu-bps-source\/blob\/develop\/docs\/release\/ddhub-client-gateway\.md/,
    );

    assert.ok(
      existsSync(
        path.join(
          siteRoot,
          "public/architecture/ewds-topics/billingInvoice.v1.0.0.schema.json",
        ),
      ),
    );
  });
});
