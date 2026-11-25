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

test("INT-429 OpenBao DDHub CG seed documents CGW API key placeholder path", () => {
  const layout = checkLayout();
  assert.equal(layout.apiKeyPath, "secret/ddhub/api-key");
  assert.equal(layout.apiKeyProperty, "CGW_API_KEY");
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

  assert.match(source, /ddhub\/api-key/);
  assert.match(source, /CGW_API_KEY/);
  assert.match(source, /dev-only-replace-me/);
  // INT-439 — seed must set BAO_ADDR so root token can list/enable mounts.
  assert.match(source, /BAO_ADDR=http:\/\/127\.0\.0\.1:8200/);
});
