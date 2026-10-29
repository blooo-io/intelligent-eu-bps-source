import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("INT-306 Client Gateway plan covers briefing constraints and GitOps", async () => {
  const text = await readFile("docs/architecture/ewds-client-gateway.md", "utf8");
  const index = await readFile("docs/architecture/README.md", "utf8");

  assert.match(text, /INT-306/);
  assert.match(text, /NFR-017/);
  assert.match(
    text,
    /docs\.energyweb\.org\/energy-solutions\/digital-spine-by-energy-web\/component-guides\/ddhub-client-gateway/,
  );
  assert.match(text, /ddhub-client-gateway-api|1\.3\.0-ewc/);
  assert.match(text, /x-api-key/);
  assert.match(text, /short polling/i);
  assert.match(text, /GitOps|INT-157/);
  assert.match(text, /REQ-053/);
  assert.match(text, /ddhub-ewc\.energyweb\.org/);
  assert.match(text, /A32/);
  assert.match(text, /INT-308/);
  assert.match(text, /cnpg-ddhub|platform-ddhub/);
  assert.match(index, /ewds-client-gateway\.md/);
  assert.doesNotMatch(index, /ewag-unblock-mail/);
  assert.doesNotMatch(text, /ewag-unblock-mail/);
});
