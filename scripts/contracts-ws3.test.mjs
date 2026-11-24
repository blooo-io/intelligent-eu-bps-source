/**
 * INT-423 WS3 — KYC, DSAR export, live-mode errors (REQ-045, REQ-051, REQ-013, REQ-043).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parse as parseYaml } from "../apps/site/node_modules/yaml/dist/index.js";

test("WS3 contracts expose KYC, DSAR export and live-mode errors (REQ-045, REQ-051, REQ-013, REQ-043)", async () => {
  const pub = parseYaml(await readFile("contracts/openapi/public.v1.yaml", "utf8"));
  assert.ok(pub.paths["/me/identity-verification"].post);
  assert.ok(pub.paths["/me/kyc"].get);
  assert.ok(pub.paths["/data-subject-requests/{id}/export"].get);
  assert.deepEqual(pub.components.schemas.MePaymentAccount.properties.kycStatus.enum, [
    "none",
    "pending",
    "verified",
    "rejected",
  ]);
  assert.ok(pub.paths["/communities/{id}/settings"].put.responses["409"]);
  const pay = parseYaml(await readFile("contracts/asyncapi/payments.v1.yaml", "utf8"));
  assert.ok(pay.channels.KycStatusChanged);
  const ip = parseYaml(await readFile("contracts/openapi/internal/payments.v1.yaml", "utf8"));
  assert.ok(ip.paths["/payment-accounts/{participantId}:erase-at-psp"].post);
  assert.ok(ip.paths["/psp/capabilities"].get);
});