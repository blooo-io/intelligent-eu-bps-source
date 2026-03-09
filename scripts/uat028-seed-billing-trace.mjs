#!/usr/bin/env node
/**
 * INT-196 / UAT-028 — operator seed: settlement StartRun → invoice from settlement.
 *
 * Prerequisites (GitOps / INT-157):
 * - kubectl context for k8s-intelligent-eu-dev
 * - port-forwards to settlement + invoicing in namespace int-apps
 *
 * Usage:
 *   SETTLEMENT_URL=http://127.0.0.1:18085 \
 *   INVOICING_URL=http://127.0.0.1:18086 \
 *   node scripts/uat028-seed-billing-trace.mjs
 *
 * Then open app.dev as uat-operator and trace invoice → tradeIds → pairSettlementId.
 * Payment creation (AC-07 payInvoice) still needs a consumer payment method +
 * producer Connect account with charges_enabled (INT-195).
 */
import assert from "node:assert/strict";

const SETTLEMENT_URL = (
  process.env.SETTLEMENT_URL ?? "http://127.0.0.1:18085"
).replace(/\/$/, "");
const INVOICING_URL = (
  process.env.INVOICING_URL ?? "http://127.0.0.1:18086"
).replace(/\/$/, "");

/** Mock S1 community (AC-15) — FixtureTradeSource default. */
const COMMUNITY_ID = "c0ffee00-1234-4abc-8def-0123456789ab";

const headers = {
  "content-type": "application/json",
  "x-intelligent-roles": "service,operator",
};

async function main() {
  const start = await fetch(`${SETTLEMENT_URL}/internal/v1/billing-runs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      communityId: COMMUNITY_ID,
      type: "early",
      period: "2026-11",
    }),
  });
  assert.equal(start.status, 202, await start.text());
  const { runId } = await start.json();
  console.log(JSON.stringify({ step: "startRun", runId }, null, 2));

  const runRes = await fetch(
    `${SETTLEMENT_URL}/internal/v1/billing-runs/${runId}`,
    { headers },
  );
  assert.equal(runRes.status, 200, await runRes.text());
  const run = await runRes.json();
  console.log(
    JSON.stringify(
      { step: "getBillingRun", settlementIds: run.settlementIds },
      null,
      2,
    ),
  );

  const invoices = [];
  for (const settlementId of run.settlementIds ?? []) {
    const sRes = await fetch(
      `${SETTLEMENT_URL}/internal/v1/settlements/${settlementId}`,
      { headers },
    );
    assert.equal(sRes.status, 200, await sRes.text());
    const settlement = await sRes.json();

    const invRes = await fetch(
      `${INVOICING_URL}/internal/v1/invoices:from-settlement`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          settlementId: settlement.settlementId,
          runId: settlement.runId,
          communityId: settlement.communityId,
          consumerId: settlement.consumerId,
          producerId: settlement.producerId,
          tradeIds: settlement.tradeIds,
          kWh: settlement.kWh,
          energyAmount: settlement.energyAmount,
          vat: settlement.vat,
          currency: settlement.currency,
          rate: settlement.rate,
        }),
      },
    );
    const invBody = await invRes.json();
    assert.ok(
      invRes.status === 201 || invRes.status === 200,
      JSON.stringify(invBody),
    );
    invoices.push(invBody);
  }

  console.log(
    JSON.stringify(
      {
        step: "invoices",
        count: invoices.length,
        invoices: invoices.map((i) => ({
          invoiceId: i.invoiceId,
          skipped: i.skipped,
          tradeIds: i.tradeIds,
          pairSettlementId: i.pairSettlementId ?? i.settlementId,
          total: i.total,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
