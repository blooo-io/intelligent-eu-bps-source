import assert from "node:assert/strict";
import test from "node:test";
import { pinImageTag } from "./pin-dev-image-tag.mjs";

test("INT-177 pins image.tag under the image block", () => {
  const input = `environment: dev
appsNamespace: int-apps
mailpit:
  enabled: true
image:
  tag: "0.0.0"
`;
  const out = pinImageTag(input, "7ae55b39297281509d884b81e47af86985cd9c06");
  assert.match(out, /tag: "7ae55b39297281509d884b81e47af86985cd9c06"/);
  assert.equal(out.includes('tag: "0.0.0"'), false);
});

test("INT-177 rejects a non-sha", () => {
  assert.throws(() => pinImageTag('image:\n  tag: "0.0.0"\n', "latest"), /invalid sha/);
});
