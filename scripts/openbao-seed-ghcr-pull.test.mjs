import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildDockerConfigJson } from "./openbao-seed-ghcr-pull.mjs";

test("INT-177 builds a ghcr.io dockerconfigjson", () => {
  const json = JSON.parse(buildDockerConfigJson("x-access-token", "ghp_test"));
  assert.equal(json.auths["ghcr.io"].username, "x-access-token");
  assert.equal(json.auths["ghcr.io"].password, "ghp_test");
  assert.equal(
    Buffer.from(json.auths["ghcr.io"].auth, "base64").toString("utf8"),
    "x-access-token:ghp_test",
  );
});

test("INT-177 seed script reads bootstrap root_token key", async () => {
  // Must match openbao-dev-bootstrap Secret data key (underscore, not hyphen).
  const source = await readFile(new URL("./openbao-seed-ghcr-pull.mjs", import.meta.url), "utf8");
  assert.match(source, /jsonpath=\{\.data\.root_token\}/);
  assert.doesNotMatch(source, /jsonpath=\{\.data\.root-token\}/);
});
