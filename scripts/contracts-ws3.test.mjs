/**
 * INT-423 WS3 — KYC, DSAR export, live-mode errors (REQ-045, REQ-051, REQ-013, REQ-043).
 * Pure string asserts: runs before pnpm install in scripts/run-tests.mjs.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("WS3 contracts expose KYC, DSAR export and live-mode errors (REQ-045, REQ-051, REQ-013, REQ-043)", async () => {
  const pub = await readFile("contracts/openapi/public.v1.yaml", "utf8");
  assert.match(pub, /\/me\/identity-verification:[\s\S]*?post:/);
  assert.match(pub, /\/me\/kyc:[\s\S]*?get:/);
  assert.match(pub, /\/data-subject-requests\/\{id\}\/export:[\s\S]*?get:/);
  assert.match(
    pub,
    /MePaymentAccount:[\s\S]*?kycStatus:[\s\S]*?enum:\s*\[none,\s*pending,\s*verified,\s*rejected\]/,
  );
  assert.match(pub, /\/communities\/\{id\}\/settings:[\s\S]*?put:[\s\S]*?'409':/);

  const pay = await readFile("contracts/asyncapi/payments.v1.yaml", "utf8");
  assert.match(pay, /KycStatusChanged:/);

  const ip = await readFile("contracts/openapi/internal/payments.v1.yaml", "utf8");
  assert.match(ip, /\/payment-accounts\/\{participantId\}:erase-at-psp:/);
  assert.match(ip, /\/psp\/capabilities:/);
});
