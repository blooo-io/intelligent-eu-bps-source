import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("D5.5 release docs point at architecture, contracts and licence (INT-93/94/95)", async () => {
  const index = await readFile("docs/release/README.md", "utf8");
  const deploy = await readFile("docs/release/deployment.md", "utf8");
  const api = await readFile("docs/release/integration-api.md", "utf8");
  const notes = await readFile("docs/release/RELEASE-NOTES.md", "utf8");
  const root = await readFile("README.md", "utf8");

  assert.match(index, /INT-93/);
  assert.match(index, /INT-94/);
  assert.match(index, /INT-95/);
  assert.match(deploy, /05-physical-architecture/);
  assert.match(deploy, /deploy\//);
  assert.match(deploy, /GitOps|Argo/);
  assert.match(api, /openapi\/public\.v1\.yaml/);
  assert.match(api, /asyncapi\//);
  assert.match(api, /contracts\/README/);
  assert.match(notes, /Apache/);
  assert.match(notes, /Stripe test/);
  assert.match(notes, /mocked|mock/i);
  assert.match(root, /docs\/release\//);

  await access("LICENSE");
  await access("NOTICE");
  await access("contracts/openapi/public.v1.yaml");
});
