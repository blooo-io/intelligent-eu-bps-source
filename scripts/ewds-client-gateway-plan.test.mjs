import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("INT-306 Client Gateway plan covers briefing constraints and GitOps", async () => {
  const text = await readFile("docs/architecture/ewds-client-gateway.md", "utf8");
  const index = await readFile("docs/architecture/README.md", "utf8");

  assert.match(text, /INT-306/);
  assert.match(text, /NFR-017/);
  assert.match(text, /does \*\*not\*\* store payloads|does not store payloads/i);
  assert.match(text, /x-api-key/);
  assert.match(text, /short polling/i);
  assert.match(text, /GitOps|INT-157/);
  assert.match(text, /REQ-053/);
  assert.match(text, /ddhub-ewc\.energyweb\.org/);
  assert.match(text, /A32/);
  assert.match(index, /ewds-client-gateway\.md/);
});
