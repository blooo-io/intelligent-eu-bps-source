/**
 * INT-423 WS3 — KYC, DSAR export, live-mode errors (REQ-045, REQ-051, REQ-013, REQ-043).
 * Pure string asserts: runs before pnpm install in scripts/run-tests.mjs.
 * INT-455 — public OpenAPI withdrawn; internal + AsyncAPI contracts.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("WS3 contracts expose KYC, DSAR export and live-mode errors (REQ-045, REQ-051, REQ-013, REQ-043)", async () => {
  const ip = await readFile("contracts/openapi/internal/payments.v1.yaml", "utf8");
  assert.match(ip, /\/kyc:start:/);
  assert.match(ip, /\/kyc-status\/\{subjectId\}:/);
  assert.match(ip, /\/payment-accounts\/\{participantId\}:erase-at-psp:/);
  assert.match(ip, /\/psp\/capabilities:/);

  const part = await readFile("contracts/openapi/internal/participants.v1.yaml", "utf8");
  assert.match(part, /data-subject request/i);

  const pay = await readFile("contracts/asyncapi/payments.v1.yaml", "utf8");
  assert.match(pay, /KycStatusChanged:/);
});