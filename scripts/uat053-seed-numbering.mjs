#!/usr/bin/env node
/**
 * INT-203 / UAT-053 — two producers on distinct Connect accounts; optional
 * multi-period seeding and Stripe sequence validation (REQ-042 / BR-10).
 *
 * Prerequisites (GitOps / INT-157):
 * - kubectl context for k8s-intelligent-eu-dev
 * - port-forwards to settlement + invoicing
 * - between periods: `kubectl -n int-apps rollout restart deploy/settlement`
 *   then re-establish the settlement port-forward (FixtureTradeSource billed set)
 *
 * Seed one period:
 *   SETTLEMENT_URL=… INVOICING_URL=… PERIOD=2026-11 \
 *     node scripts/uat053-seed-numbering.mjs seed
 *
 * Validate both Connect sequences (after two period seeds):
 *   STRIPE_SECRET_KEY=sk_test_… \
 *     node scripts/uat053-seed-numbering.mjs validate
 */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const SETTLEMENT_URL = (
  process.env.SETTLEMENT_URL ?? "http://127.0.0.1:18085"
).replace(/\/$/, "");
const INVOICING_URL = (
  process.env.INVOICING_URL ?? "http://127.0.0.1:18086"
).replace(/\/$/, "");
const STRIPE_SECRET_KEY = (process.env.STRIPE_SECRET_KEY ?? "").trim();
const PERIOD = (process.env.PERIOD ?? "2026-11").trim();
const EVIDENCE_PATH =
  process.env.UAT053_EVIDENCE ?? "/tmp/uat053-seed-evidence.json";

/** Mock S1 community (AC-15). */
const COMMUNITY_ID = "c0ffee00-1234-4abc-8def-0123456789ab";
/** S1 producer UUIDs → distinct Connect accounts with charges_enabled. */
const PRODUCER_STRIPE_MAP = {
  "66666666-7777-4888-9999-aaaaaaaaaaaa": "acct_1URyv9FGX8DfzG09",
  "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff": "acct_1URvtiF4LYz7qY6g",
};

const headers = {
  "content-type": "application/json",
  "x-intelligent-roles": "service,operator",
};

async function stripeGet(path, stripeAccount) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Stripe-Account": stripeAccount,
    },
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  return body;
}

/** REQ-042 — EWDS shares invoiceId; legal number stays off the wire. */
function assertEwdsCarriesInvoiceIdOnly(sampleInvoiceId) {
  assert.equal(typeof sampleInvoiceId, "string");
  assert.doesNotMatch(
    sampleInvoiceId,
    /^[A-Z0-9]{6,}-\d+$/,
    "EWDS identifier must be invoiceId, not Stripe legal number",
  );
}

async function seedPeriod(period) {
  const start = await fetch(`${SETTLEMENT_URL}/internal/v1/billing-runs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      communityId: COMMUNITY_ID,
      type: "early",
      period,
    }),
  });
  const startBody = await start.json();
  assert.equal(start.status, 202, JSON.stringify(startBody));
  const { runId } = startBody;

  const runRes = await fetch(
    `${SETTLEMENT_URL}/internal/v1/billing-runs/${runId}`,
    { headers },
  );
  const run = await runRes.json();
  assert.equal(runRes.status, 200, JSON.stringify(run));
  assert.ok(
    (run.settlementIds ?? []).length >= 2,
    `expected ≥2 settlements for ${period}, got ${JSON.stringify(run.settlementIds)}`,
  );

  const invoices = [];
  for (const settlementId of run.settlementIds) {
    const sRes = await fetch(
      `${SETTLEMENT_URL}/internal/v1/settlements/${settlementId}`,
      { headers },
    );
    const settlement = await sRes.json();
    assert.equal(sRes.status, 200, JSON.stringify(settlement));

    const stripeAccountId = PRODUCER_STRIPE_MAP[settlement.producerId];
    assert.ok(
      stripeAccountId,
      `no Connect map for producer ${settlement.producerId}`,
    );

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
          producerStripeAccountId: stripeAccountId,
        }),
      },
    );
    const invBody = await invRes.json();
    assert.ok(
      invRes.status === 201 || invRes.status === 200,
      JSON.stringify(invBody),
    );
    assertEwdsCarriesInvoiceIdOnly(invBody.invoiceId);
    invoices.push({
      period,
      runId,
      producerId: settlement.producerId,
      settlementId: settlement.settlementId,
      stripeAccountId,
      invoiceId: invBody.invoiceId,
      total: invBody.total,
      tradeIds: invBody.tradeIds,
    });
  }
  return invoices;
}

async function loadEvidence() {
  try {
    return JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
  } catch {
    return [];
  }
}

async function cmdSeed() {
  const batch = await seedPeriod(PERIOD);
  const prev = await loadEvidence();
  const next = [...prev, ...batch];
  await writeFile(EVIDENCE_PATH, JSON.stringify(next, null, 2));
  console.log(
    JSON.stringify(
      { step: "seed", period: PERIOD, count: batch.length, batch, evidencePath: EVIDENCE_PATH },
      null,
      2,
    ),
  );
}

async function cmdValidate() {
  assert.ok(STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY required");
  const seeded = await loadEvidence();
  assert.ok(seeded.length >= 4, `need ≥4 seeded invoices, got ${seeded.length}`);
  const producers = new Set(seeded.map((s) => s.producerId));
  const periods = new Set(seeded.map((s) => s.period));
  assert.equal(producers.size, 2, "two producers");
  assert.ok(periods.size >= 2, "two periods");

  const byAccount = new Map();
  for (const row of seeded) {
    const list = byAccount.get(row.stripeAccountId) ?? [];
    list.push(row);
    byAccount.set(row.stripeAccountId, list);
  }
  assert.equal(byAccount.size, 2, "two Connect accounts");

  const evidence = [];
  for (const [acct, rows] of byAccount) {
    const listed = await stripeGet("/invoices?limit=30", acct);
    const matched = [];
    for (const row of rows) {
      const hit = (listed.data ?? []).find(
        (inv) => inv.metadata?.settlementId === row.settlementId,
      );
      assert.ok(
        hit,
        `Stripe invoice missing for settlement ${row.settlementId} on ${acct}`,
      );
      assert.ok(hit.number, "legal number present (PDF)");
      assert.ok(hit.invoice_pdf, "invoice_pdf present");
      assert.ok(hit.total > 0, "non-zero total");
      matched.push({
        settlementId: row.settlementId,
        period: row.period,
        invoiceId: row.invoiceId,
        stripeInvoiceId: hit.id,
        number: hit.number,
        total: hit.total,
        hasPdf: Boolean(hit.invoice_pdf),
      });
      assertEwdsCarriesInvoiceIdOnly(row.invoiceId);
    }
    const suffixes = matched
      .map((m) => {
        const n = Number(String(m.number).split("-").pop());
        assert.ok(Number.isFinite(n), `parse number ${m.number}`);
        return { n, number: m.number };
      })
      .sort((a, b) => a.n - b.n);
    for (let i = 1; i < suffixes.length; i++) {
      assert.equal(
        suffixes[i].n,
        suffixes[i - 1].n + 1,
        `gap in sequence on ${acct}: ${suffixes.map((s) => s.number).join(",")}`,
      );
    }
    evidence.push({
      stripeAccountId: acct,
      invoices: matched,
      sequence: suffixes.map((s) => s.number),
    });
  }

  console.log(JSON.stringify({ step: "validate", status: "ok", evidence }, null, 2));
}

const cmd = process.argv[2] ?? "seed";
const run = cmd === "validate" ? cmdValidate : cmdSeed;
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
