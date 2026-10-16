import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { checkLayout } from "./openbao-seed-ddhub-cg.mjs";

test("INT-308 OpenBao DDHub CG seed documents KV v1 mount ddhub/", () => {
  const layout = checkLayout();
  assert.match(layout.mount, /ddhub/);
  assert.match(layout.kvPath, /platform\/ddhub/);
  assert.equal(layout.property, "vault_token");
});

test("INT-308 seed script CLI uses Set.has and is documented", async () => {
  const source = await readFile(
    new URL("./openbao-seed-ddhub-cg.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /const args = new Set/);
  assert.match(source, /args\.has\("--apply"\)/);
  assert.equal(source.includes("args.includes("), false);

  const release = await readFile(
    new URL("../docs/release/ddhub-client-gateway.md", import.meta.url),
    "utf8",
  );
  assert.match(release, /openbao-seed-ddhub-cg\.mjs/);
  assert.match(release, /ddhub\//);
});
