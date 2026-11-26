/**
 * Contract assertions for WS1 billing-model realignment (INT-423).
 * Covers early-settlement removal (REQ-057), statements (REQ-059), payouts (REQ-015/060).
 * INT-455 — public OpenAPI withdrawn; asserts internal + shared schemas only.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("WS1 REQ-057: early settlement is gone from every contract", async () => {
  const comp = await readFile("contracts/openapi/components/schemas.yaml", "utf8");
  assert.match(comp, /BillingRunType:[\s\S]*?enum: \[periodic, final\]/);
  const sa = await readFile("contracts/asyncapi/settlement.v1.yaml", "utf8");
  assert.doesNotMatch(sa, /earlySettlementId/);
  for (const f of [
    "contracts/asyncapi/invoicing.v1.yaml",
    "docs/architecture/ewds-topics/billingInvoice.v1.0.0.schema.json",
    "mocks/schemas/billingInvoice.v1.0.0.schema.json",
  ])
    assert.doesNotMatch(await readFile(f, "utf8"), /"early"|\bearly\b(?=[",\]])/);
  assert.doesNotMatch(
    await readFile("deploy/charts/apisix-gateway/templates/routes.yaml", "utf8"),
    /early-settlements/,
  );
});

test("WS1 REQ-059: statement contract", async () => {
  const inv = await readFile("contracts/openapi/internal/invoicing.v1.yaml", "utf8");
  assert.match(
    inv,
    /\/statements:[\s\S]*?operationId: listStatements[\s\S]*?REQ-059/,
  );
  assert.match(inv, /InternalStatement:/);
  const ia = await readFile("contracts/asyncapi/invoicing.v1.yaml", "utf8");
  assert.match(ia, /StatementIssued:/);
  assert.match(ia, /StatementStatusChanged:/);
});

test("WS1 REQ-015/REQ-060: payout contracts", async () => {
  const part = await readFile("contracts/openapi/internal/participants.v1.yaml", "utf8");
  assert.match(part, /autoPayout:/);
  const ip = await readFile("contracts/openapi/internal/payments.v1.yaml", "utf8");
  assert.doesNotMatch(ip, /connected-customers/);
  assert.match(ip, /\/payouts:run-auto:/);
  assert.match(ip, /\/payouts:request:/);
  assert.match(await readFile("contracts/asyncapi/payments.v1.yaml", "utf8"), /PayoutStatusChanged:/);
  assert.match(await readFile("contracts/openapi/internal/payments.v1.yaml", "utf8"), /RunAutoPayouts/);
});