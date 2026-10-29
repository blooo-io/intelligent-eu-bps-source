/**
 * INT-307 — EWAG unblock mail draft + tracker layout.
 * Mail stays short: CSR (attached) + whitelist IPs + faucet + roles.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("EWAG unblock mail asks only for CSR / faucet / whitelist / roles (INT-307)", async () => {
  const mail = await readFile(
    "docs/architecture/ewag-unblock-mail-int-307.md",
    "utf8",
  );
  assert.match(mail, /INT-307/);
  assert.match(mail, /Configured/);
  assert.match(mail, /Verified/);
  assert.match(mail, /CSR/);
  assert.match(mail, /faucet/i);
  assert.match(mail, /\bEWT\b/);
  assert.match(mail, /whitelist/i);
  assert.match(mail, /user roles|enrol/i);
  assert.match(mail, /Answers tracker/);
  assert.match(mail, /Blooo-side \(do \*\*not\*\* ask EWAG\)/);
  assert.match(mail, /openssl genrsa/);
  assert.match(mail, /openssl req -new/);
  assert.match(mail, /blooo-cg-mtls\.csr/);
  assert.match(mail, /51\.15\.34\.84/);
  assert.match(mail, /51\.15\.34\.86/);
  assert.match(mail, /51\.15\.126\.180/);

  const bodyMatch = mail.match(/```text\n([\s\S]*?)```/);
  assert.ok(bodyMatch, "mail copy/paste body present");
  const body = bodyMatch[1];
  assert.match(body, /CSR attached|blooo-cg-mtls\.csr/i);
  assert.match(body, /faucet/i);
  assert.match(body, /51\.15\.34\.84/);
  assert.match(body, /51\.15\.34\.86/);
  assert.match(body, /51\.15\.126\.180/);
  assert.match(body, /user roles/i);
  assert.doesNotMatch(body, /websocket|short polling/i);
  assert.doesNotMatch(body, /x-api-key/);
  assert.doesNotMatch(body, /REQ-053|7 days/);
  assert.doesNotMatch(body, /JSON Schema|draft-07|2020-12/);
  assert.doesNotMatch(body, /Please confirm or correct/i);
  assert.doesNotMatch(body, /\.key\b/);

  const plan = await readFile(
    "docs/architecture/ewds-client-gateway.md",
    "utf8",
  );
  assert.match(plan, /ewag-unblock-mail-int-307\.md/);
  assert.match(plan, /EWT faucet|CSR → EWF-signed/i);
});
