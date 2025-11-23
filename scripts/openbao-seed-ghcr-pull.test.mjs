import assert from "node:assert/strict";
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
