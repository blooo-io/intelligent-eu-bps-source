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
