#!/usr/bin/env node
/**
 * INT-228 / INT-229 / INT-238 — operator seed: create **new** Stripe Connect
 * producers each run, bind them in AC-07, reset billed trades (fixture or
 * AC-04 HTTP), start a billing run, then **poll** AC-06 for invoices created
 * by the SettlementCompleted NATS consumer (no HTTP invoice bridge).
 *
 * Prerequisites:
 * - kubectl port-forwards to payments, settlement, invoicing
 * - Stripe test secrets already on payments/invoicing pods (OpenBao)
 * - INT-230/236 S1 participants seeded in AC-03; INT-232 trade-intake bootstrapped
 * - INT-223 AC-06 JetStream consumer live
 *
 * Usage:
 *   PAYMENTS_URL=http://127.0.0.1:18087 \
 *   SETTLEMENT_URL=http://127.0.0.1:18085 \
 *   INVOICING_URL=http://127.0.0.1:18086 \
 *   node scripts/stripe-fresh-billing-run.mjs
 *
 * Does **not** invent acct_test_* — every producer Connect id comes from Stripe.
 * Does **not** POST the operator invoice bridge — NATS is the primary path (INT-238).
 */
import assert from "node:assert/strict";

const PAYMENTS_URL = (
  process.env.PAYMENTS_URL ?? "http://127.0.0.1:18087"
).replace(/\/$/, "");
const SETTLEMENT_URL = (
  process.env.SETTLEMENT_URL ?? "http://127.0.0.1:18085"
).replace(/\/$/, "");
const INVOICING_URL = (
  process.env.INVOICING_URL ?? "http://127.0.0.1:18086"
).replace(/\/$/, "");

const COMMUNITY_ID = "c0ffee00-1234-4abc-8def-0123456789ab";
/** S1 fixture producers (AC-15) — rebound to fresh Stripe Connect accounts each run. */
const PRODUCERS = [
  "66666666-7777-4888-9999-aaaaaaaaaaaa",
  "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
];

const POLL_MS = Number(process.env.NATS_INVOICE_POLL_MS ?? 2000);
const POLL_ATTEMPTS = Number(process.env.NATS_INVOICE_POLL_ATTEMPTS ?? 30);

const headers = {
  "content-type": "application/json",
  "x-intelligent-roles": "service,operator",
  "x-intelligent-sub": "int-238-nats-smoke",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRunSettlements(runId) {
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const res = await fetch(`${SETTLEMENT_URL}/internal/v1/billing-runs/${runId}`, {
      headers,
    });
    if (res.ok) {
      const body = await res.json();
      if (Array.isArray(body.settlementIds) && body.settlementIds.length > 0) {
        return body;
      }
    }
    await sleep(POLL_MS);
  }
  throw new Error(`billing run ${runId} produced no settlementIds`);
}

/**
 * INT-238 — poll GET invoices:by-settlement (never the operator bridge POST).
 * Zero-amount pairs may stay 404 (carry-forward); non-zero must appear.
 */
async function waitForInvoice(settlementId) {
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const res = await fetch(
      `${INVOICING_URL}/internal/v1/invoices:by-settlement/${settlementId}`,
      { headers },
    );
    if (res.status === 200) {
      return await res.json();
    }
    if (res.status !== 404) {
      throw new Error(
        `by-settlement ${settlementId}: unexpected ${res.status}`,
      );
    }
    await sleep(POLL_MS);
  }
  return null;
}

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
        path: "NATS SettlementCompleted → AC-06 (no HTTP bridge)",
      },
      null,
      2,
    ),
  );

  const run = await waitForRunSettlements(startBody.runId);
  console.log(
    JSON.stringify(
      {
        step: "runSettlements",
        runId: run.runId,
        settlementIds: run.settlementIds,
      },
      null,
      2,
    ),
  );

  const invoices = [];
  const pending = [];
  for (const settlementId of run.settlementIds) {
    const invoice = await waitForInvoice(settlementId);
    if (invoice) {
      invoices.push(invoice);
    } else {
      // May be zero-amount carry-forward (BR-05) — confirm via AC-05.
      const pairRes = await fetch(
        `${SETTLEMENT_URL}/internal/v1/settlements/${settlementId}`,
        { headers },
      );
      const pair = pairRes.ok ? await pairRes.json() : null;
      const energy = Number(pair?.energyAmount ?? pair?.netAmount ?? NaN);
      if (Number.isFinite(energy) && energy === 0) {
        pending.push({ settlementId, reason: "zero_amount_carry_forward" });
      } else {
        throw new Error(
          `NATS path did not produce invoice for settlement ${settlementId}`,
        );
      }
    }
  }

  assert.ok(
    invoices.length > 0,
    "expected at least one invoice from NATS SettlementCompleted",
  );
  console.log(
    JSON.stringify(
      {
        step: "natsInvoices",
        count: invoices.length,
        invoices: invoices.map((i) => ({
          invoiceId: i.invoiceId,
          pairSettlementId: i.pairSettlementId,
          total: i.total,
          status: i.status,
          hostedInvoiceUrl: i.hostedInvoiceUrl,
        })),
        skipped: pending,
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
