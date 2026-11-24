/**
 * Contract assertions for WS1 billing-model realignment (INT-423).
 * Covers early-settlement removal (REQ-057), statements (REQ-059), payouts (REQ-015/060).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("WS1 REQ-057: early settlement is gone from every contract", async () => {
  const pub = await readFile("contracts/openapi/public.v1.yaml", "utf8");
  assert.doesNotMatch(pub, /\/early-settlements:/);
  assert.doesNotMatch(pub, /createEarlySettlement/);
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
  const pub = await readFile("contracts/openapi/public.v1.yaml", "utf8");
  assert.match(pub, /\/me\/statements:[\s\S]*?operationId: listMyStatements[\s\S]*?x-served-by: AC-06/);
  assert.match(pub, /Statement:[\s\S]*?required: \[statementId, participantId, communityId, period, periodFrom, periodUntil, totalBought, totalSold, netBalance, direction, currency, invoiceIds, status, revision\]/);
  const ia = await readFile("contracts/asyncapi/invoicing.v1.yaml", "utf8");
  assert.match(ia, /StatementIssued:/);
  assert.match(ia, /StatementStatusChanged:/);
  assert.match(await readFile("contracts/openapi/internal/invoicing.v1.yaml", "utf8"), /\/statements:[\s\S]*?operationId: listStatements/);
});

test("WS1 REQ-015/REQ-060: payout contracts", async () => {
  const pub = await readFile("contracts/openapi/public.v1.yaml", "utf8");
  assert.match(pub, /\/me\/payouts:[\s\S]*?operationId: listMyPayouts[\s\S]*?operationId: requestWithdrawal[\s\S]*?x-served-by: AC-07/);
  assert.match(pub, /\/communities\/\{id\}\/payouts-overview:[\s\S]*?x-served-by: AC-09/);
  assert.match(pub, /CommunitySettings:[\s\S]*?autoPayout:/);
  assert.match(pub, /enum: \[kyc_required, statement_not_found, producer_invoices_unpaid, nothing_to_pay_out, funds_pending\]/);
  const ip = await readFile("contracts/openapi/internal/payments.v1.yaml", "utf8");
  assert.doesNotMatch(ip, /connected-customers/);
  assert.match(ip, /\/payouts:run-auto:/);
  assert.match(await readFile("contracts/asyncapi/payments.v1.yaml", "utf8"), /PayoutStatusChanged:/);
  assert.match(await readFile("contracts/openapi/components/schemas.yaml", "utf8"), /RunAutoPayouts/);
});
