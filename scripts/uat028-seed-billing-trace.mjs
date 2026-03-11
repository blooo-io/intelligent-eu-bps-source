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
 *   PRODUCER_STRIPE_ACCOUNT_ID=acct_... \
 *   node scripts/uat028-seed-billing-trace.mjs
 *
 * PRODUCER_STRIPE_ACCOUNT_ID is required against live Stripe (INT-197): without
 * it AC-06 synthesises acct_test_* and Stripe rejects the invoice create.
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

/**
 * INT-197 — real Connect account with charges_enabled (UAT-015).
 * Applied to every pair settlement when set (S1 has two producers).
 */
const PRODUCER_STRIPE_ACCOUNT_ID = (
  process.env.PRODUCER_STRIPE_ACCOUNT_ID ?? ""
).trim();

const headers = {
  "content-type": "application/json",
  "x-intelligent-roles": "service,operator",
};

async function main() {
  if (!PRODUCER_STRIPE_ACCOUNT_ID) {
    console.error(
      "PRODUCER_STRIPE_ACCOUNT_ID is required (Connect account with charges_enabled).",
    );
    process.exit(1);
  }

  const start = await fetch(`${SETTLEMENT_URL}/internal/v1/billing-runs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      communityId: COMMUNITY_ID,
      type: "early",
      period: "2026-11",
    }),
  });
  const startBody = await start.json();
  assert.equal(start.status, 202, JSON.stringify(startBody));
  const { runId } = startBody;
  console.log(JSON.stringify({ step: "startRun", runId }, null, 2));

  const runRes = await fetch(
    `${SETTLEMENT_URL}/internal/v1/billing-runs/${runId}`,
    { headers },
  );
  const run = await runRes.json();
  assert.equal(runRes.status, 200, JSON.stringify(run));
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
    const settlement = await sRes.json();
    assert.equal(sRes.status, 200, JSON.stringify(settlement));

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
          producerStripeAccountId: PRODUCER_STRIPE_ACCOUNT_ID,
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
