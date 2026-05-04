#!/usr/bin/env node
/**
 * INT-228 — operator seed: create **new** Stripe Connect producers each run,
 * bind them in AC-07, reset fixture billed trades, start a billing run so AC-06
 * NATS consumer creates real Stripe Customers + Invoices (visible in Dashboard).
 *
 * Prerequisites:
 * - kubectl port-forwards to payments, settlement (and optionally invoicing)
 * - Stripe test secrets already on payments/invoicing pods (OpenBao)
 *
 * Usage:
 *   PAYMENTS_URL=http://127.0.0.1:18087 \
 *   SETTLEMENT_URL=http://127.0.0.1:18085 \
 *   node scripts/stripe-fresh-billing-run.mjs
 *
 * Does **not** invent acct_test_* — every producer Connect id comes from Stripe.
 */
import assert from "node:assert/strict";

const PAYMENTS_URL = (
  process.env.PAYMENTS_URL ?? "http://127.0.0.1:18087"
).replace(/\/$/, "");
const SETTLEMENT_URL = (
  process.env.SETTLEMENT_URL ?? "http://127.0.0.1:18085"
).replace(/\/$/, "");

const COMMUNITY_ID = "c0ffee00-1234-4abc-8def-0123456789ab";
/** S1 fixture producers (AC-15) — rebound to fresh Stripe Connect accounts each run. */
const PRODUCERS = [
  "66666666-7777-4888-9999-aaaaaaaaaaaa",
  "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
];

const headers = {
  "content-type": "application/json",
  "x-intelligent-roles": "service,operator",
  "x-intelligent-sub": "int-228-fresh-seed",
};

async function main() {
  const provisioned = [];
  for (const participantId of PRODUCERS) {
    const res = await fetch(
      `${PAYMENTS_URL}/internal/v1/payment-accounts:provision`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          participantId,
          communityId: COMMUNITY_ID,
          role: "producer",
          fresh: true,
        }),
      },
    );
    const body = await res.json();
    assert.equal(res.status, 201, JSON.stringify(body));
    assert.ok(
      typeof body.stripeAccountId === "string" &&
        body.stripeAccountId.startsWith("acct_"),
      JSON.stringify(body),
    );
    assert.ok(
      !String(body.stripeAccountId).startsWith("acct_test_"),
      `expected real Stripe Connect id, got ${body.stripeAccountId}`,
    );
    provisioned.push({
      participantId,
      stripeAccountId: body.stripeAccountId,
      chargesEnabled: body.chargesEnabled,
      kycStatus: body.kycStatus,
    });
  }
  console.log(JSON.stringify({ step: "provision", provisioned }, null, 2));

  const reset = await fetch(
    `${SETTLEMENT_URL}/internal/v1/fixture-billed:reset`,
    { method: "POST", headers },
  );
  const resetBody = await reset.json();
  assert.equal(reset.status, 200, JSON.stringify(resetBody));
  console.log(JSON.stringify({ step: "resetFixtureBilled", resetBody }, null, 2));

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
  console.log(
    JSON.stringify(
      {
        step: "startRun",
        runId: startBody.runId,
        hint: "AC-06 NATS SettlementCompleted → Stripe invoices on the new Connect accounts",
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
