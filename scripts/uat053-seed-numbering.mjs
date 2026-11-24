#!/usr/bin/env node
/**
 * INT-203 / UAT-053 — two producers; multi-period seeding and billing-owned
 * legal-number sequence validation (REQ-042 / BR-10 / A6).
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
 * Validate legal numbers via GET /internal/v1/invoices/{id} (not Stripe):
 *   node scripts/uat053-seed-numbering.mjs validate
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SETTLEMENT_URL = (
  process.env.SETTLEMENT_URL ?? "http://127.0.0.1:18085"
).replace(/\/$/, "");
const INVOICING_URL = (
  process.env.INVOICING_URL ?? "http://127.0.0.1:18086"
).replace(/\/$/, "");
const PERIOD = (process.env.PERIOD ?? "2026-11").trim();
/** Prefer a repo-local path over world-writable /tmp (javascript:S5443). */
const EVIDENCE_PATH =
  process.env.UAT053_EVIDENCE ??
  path.join(root, "artifacts", "uat053-seed-evidence.json");

/** Mock S1 community (AC-15). */
const COMMUNITY_ID = "c0ffee00-1234-4abc-8def-0123456789ab";
/** S1 producer UUIDs (REQ-042 series is per producerId, not Connect account). */
const PRODUCER_IDS = [
  "66666666-7777-4888-9999-aaaaaaaaaaaa",
  "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
];

const headers = {
  "content-type": "application/json",
  "x-intelligent-roles": "service,operator",
};

/** REQ-042 — EWDS shares invoiceId; legal number stays off the wire. */
function assertEwdsCarriesInvoiceIdOnly(sampleInvoiceId) {
  assert.equal(typeof sampleInvoiceId, "string");
  assert.doesNotMatch(
    sampleInvoiceId,
    /^SB-[A-F0-9]{8}-\d{6}$/,
    "EWDS identifier must be invoiceId, not billing legal number",
  );
}

async function seedPeriod(period) {
  const start = await fetch(`${SETTLEMENT_URL}/internal/v1/billing-runs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      communityId: COMMUNITY_ID,
      type: "final",
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

    assert.ok(
      PRODUCER_IDS.includes(settlement.producerId),
      `unexpected producer ${settlement.producerId}`,
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
      invoiceId: invBody.invoiceId,
      legalNumber: invBody.legalNumber ?? null,
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
  await mkdir(path.dirname(EVIDENCE_PATH), { recursive: true, mode: 0o700 });
  await writeFile(EVIDENCE_PATH, JSON.stringify(next, null, 2), { mode: 0o600 });
  console.log(
    JSON.stringify(
      { step: "seed", period: PERIOD, count: batch.length, batch, evidencePath: EVIDENCE_PATH },
      null,
      2,
    ),
  );
}

async function fetchInvoice(invoiceId) {
  const res = await fetch(
    `${INVOICING_URL}/internal/v1/invoices/${invoiceId}`,
    { headers },
  );
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  return body;
}

async function cmdValidate() {
  const seeded = await loadEvidence();
  assert.ok(seeded.length >= 4, `need ≥4 seeded invoices, got ${seeded.length}`);
  const producers = new Set(seeded.map((s) => s.producerId));
  const periods = new Set(seeded.map((s) => s.period));
  assert.equal(producers.size, 2, "two producers");
  assert.ok(periods.size >= 2, "two periods");

  const byProducer = new Map();
  for (const row of seeded) {
    const list = byProducer.get(row.producerId) ?? [];
    list.push(row);
    byProducer.set(row.producerId, list);
  }
  assert.equal(byProducer.size, 2, "two producer series");

  const evidence = [];
  for (const [producerId, rows] of byProducer) {
    const matched = [];
    for (const row of rows) {
      const inv = await fetchInvoice(row.invoiceId);
      assert.equal(inv.producerId, producerId);
      assert.ok(
        typeof inv.legalNumber === "string" && inv.legalNumber.length > 0,
        "legal number present (billing)",
      );
      assert.match(
        inv.legalNumber,
        /^SB-[A-F0-9]{8}-\d{6}$/,
        `legal number format ${inv.legalNumber}`,
      );
      assert.ok(Number(inv.total) > 0, "non-zero total");
      matched.push({
        settlementId: row.settlementId,
        period: row.period,
        invoiceId: row.invoiceId,
        legalNumber: inv.legalNumber,
        total: inv.total,
      });
      assertEwdsCarriesInvoiceIdOnly(row.invoiceId);
    }
    const suffixes = matched
      .map((m) => {
        const n = Number(String(m.legalNumber).split("-").pop());
        assert.ok(Number.isFinite(n), `parse number ${m.legalNumber}`);
        return { n, number: m.legalNumber };
      })
      .sort((a, b) => a.n - b.n);
    for (let i = 1; i < suffixes.length; i++) {
      assert.equal(
        suffixes[i].n,
        suffixes[i - 1].n + 1,
        `gap in sequence for ${producerId}: ${suffixes.map((s) => s.number).join(",")}`,
      );
    }
    evidence.push({
      producerId,
      invoices: matched,
      sequence: suffixes.map((s) => s.number),
    });
  }

  console.log(JSON.stringify({ step: "validate", status: "ok", evidence }, null, 2));
}

const cmd = process.argv[2] ?? "seed";
const run = cmd === "validate" ? cmdValidate : cmdSeed;
try {
  await run();
} catch (err) {
  console.error(err);
  process.exit(1);
}
