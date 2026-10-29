/**
 * INT-307 — EWAG unblock mail draft + tracker layout.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("EWAG unblock mail draft covers open questions (INT-307)", async () => {
  const mail = await readFile(
    "docs/architecture/ewag-unblock-mail-int-307.md",
    "utf8",
  );
  assert.match(mail, /INT-307/);
  assert.match(mail, /Configured/);
  assert.match(mail, /Verified/);
  assert.match(mail, /websocket:\s*NONE|short polling/i);
  assert.match(mail, /x-api-key/);
  assert.match(mail, /CSR|mTLS/);
  assert.match(mail, /billingInvoice/);
  assert.match(mail, /billingPayment/);
  assert.match(mail, /7 days|REQ-053/);
  assert.match(mail, /egress|FQDN/i);
  assert.match(mail, /Answers tracker/);

  const plan = await readFile(
    "docs/architecture/ewds-client-gateway.md",
    "utf8",
  );
  assert.match(plan, /ewag-unblock-mail-int-307\.md/);
});
