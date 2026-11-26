#!/usr/bin/env node
/**
 * INT-461 — destinDev Stripe money-path E2E driver (S8 pay, S9 fail+reminder, S10 payout).
 *
 * run_path: stripe-test. Called from `.github/workflows/money-path-stripe-dev.yml`
 * after `scripts/stripe-fresh-billing-run.mjs` writes E2E_FRESH_INVOICE_IDS.
 *
 * Env:
 *   PAYMENTS_URL, INVOICING_URL, NOTIFICATION_URL (optional)
 *   KEYCLOAK_* (via buildInternalServiceHeaders)
 *   E2E_FRESH_INVOICE_IDS — comma-separated Open invoice ids from the seed step
 *   STRIPE_SECRET_KEY — sk_test_* (Connect balance seed for S10)
 *   EVIDENCE_DIR — optional; writes input/output JSON packs when set
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildInternalServiceHeaders } from "./lib/service-jwt.mjs";

const PAYMENTS_URL = (process.env.PAYMENTS_URL ?? "http://127.0.0.1:18087").replace(
  /\/$/,
  "",
);
const INVOICING_URL = (process.env.INVOICING_URL ?? "http://127.0.0.1:18086").replace(
  /\/$/,
  "",
);

const LEA = "11111111-2222-4333-8444-555555555555";
const MANAGER = "dddddddd-eeee-4fff-8000-111111111111";
const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";

const POLL_MS = Number(process.env.MONEY_PATH_POLL_MS ?? 1500);
const POLL_ATTEMPTS = Number(process.env.MONEY_PATH_POLL_ATTEMPTS ?? 20);

/** @type {Record<string, string>} */
let headers = {};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function evidenceRoot() {
  const dir = process.env.EVIDENCE_DIR?.trim();
  return dir && dir.length > 0 ? dir : null;
}

function writeEvidence(name, input, output) {
  const root = evidenceRoot();
  if (!root) return;
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "input.json"), `${JSON.stringify(input, null, 2)}\n`);
  writeFileSync(path.join(dir, "output.json"), `${JSON.stringify(output, null, 2)}\n`);
}

async function jsonFetch(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function stripe(method, apiPath, body, stripeAccount) {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  assert.ok(key.startsWith("sk_test_"), "STRIPE_SECRET_KEY=sk_test_* required");
  const h = { authorization: `Bearer ${key}` };
  /** @type {RequestInit} */
  const init = { method, headers: h };
  if (body && method !== "GET") {
    h["content-type"] = "application/x-www-form-urlencoded";
    init.body = new URLSearchParams(body).toString();
  }
  if (stripeAccount) h["Stripe-Account"] = stripeAccount;
  const res = await fetch(`https://api.stripe.com/v1${apiPath}`, init);
  const json = await res.json();
  assert.ok(res.ok, `Stripe ${method} ${apiPath} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

function freshInvoiceIds() {
  const raw = process.env.E2E_FRESH_INVOICE_IDS ?? "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  assert.ok(ids.length >= 2, "E2E_FRESH_INVOICE_IDS needs ≥2 invoices (S8 + S9)");
  return ids;
}

async function pollPayment(paymentId, want) {
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const { status, body } = await jsonFetch(`${PAYMENTS_URL}/internal/v1/payments/${paymentId}`);
    if (status === 200 && want.includes(body.status)) return body;
    await sleep(POLL_MS);
  }
  throw new Error(`payment ${paymentId} never reached ${want.join("|")}`);
}

async function pollInvoice(invoiceId, want) {
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const { status, body } = await jsonFetch(
      `${INVOICING_URL}/internal/v1/invoices/${invoiceId}`,
    );
    if (status === 200 && want.includes(body.status)) return body;
    await sleep(POLL_MS);
  }
  throw new Error(`invoice ${invoiceId} never reached ${want.join("|")}`);
}

async function attachPm(participantId, paymentMethodId) {
  const { status, body } = await jsonFetch(
    `${PAYMENTS_URL}/internal/v1/payment-methods:attach`,
    {
      method: "POST",
      body: JSON.stringify({ participantId, paymentMethodId }),
    },
  );
  assert.equal(status, 200, JSON.stringify(body));
  return body;
}

async function startPayment(invoiceId) {
  const { status, body } = await jsonFetch(`${PAYMENTS_URL}/internal/v1/payments:start`, {
    method: "POST",
    body: JSON.stringify({
      invoiceId,
      actorId: LEA,
      surface: "hosted",
      returnUrl: "https://app.dev.intelligent-eu-bp.blooo.dev/billing/return",
    }),
  });
  assert.equal(status, 200, JSON.stringify(body));
  return body;
}

/** S8 — pay first fresh invoice with Visa → invoice Paid. */
async function runS8(invoiceId) {
  await attachPm(LEA, "pm_card_visa");
  const started = await startPayment(invoiceId);
  const payment = await pollPayment(started.paymentId, ["succeeded"]);
  const invoice = await pollInvoice(invoiceId, ["Paid"]);
  writeEvidence(
    "s08-pay",
    { invoiceId, actorId: LEA, paymentMethodId: "pm_card_visa" },
    { payment, invoice },
  );
  console.log(JSON.stringify({ step: "S8", paymentId: payment.paymentId, invoiceStatus: invoice.status }));
  return { payment, invoice };
}

/** S9 — decline PM → failed payment → invoice reminder. */
async function runS9(invoiceId) {
  await attachPm(LEA, "pm_card_chargeDeclined");
  const started = await startPayment(invoiceId);
  const payment = await pollPayment(started.paymentId, ["failed"]);
  const invoice = await pollInvoice(invoiceId, ["Open", "Overdue", "PartiallyPaid"]);
  const { status, body: reminder } = await jsonFetch(
    `${INVOICING_URL}/internal/v1/invoices/${invoiceId}/reminders`,
    {
      method: "POST",
      body: JSON.stringify({
        actorId: MANAGER,
        communityId: COMMUNITY,
        trigger: "manual",
      }),
    },
  );
  assert.equal(status, 200, JSON.stringify(reminder));
  assert.ok(reminder.reminderCount >= 1);
  // Restore Visa for any later pays in the same process.
  await attachPm(LEA, "pm_card_visa");
  writeEvidence(
    "s09-failure",
    {
      invoiceId,
      paymentMethodId: "pm_card_chargeDeclined",
      reminder: { actorId: MANAGER, communityId: COMMUNITY },
    },
    { payment, invoiceStatus: invoice.status, reminder },
  );
  console.log(
    JSON.stringify({
      step: "S9",
      paymentId: payment.paymentId,
      paymentStatus: payment.status,
      reminderCount: reminder.reminderCount,
    }),
  );
  return { payment, reminder };
}

/**
 * S10 — Void leftover Open producer invoices, seed available balance, payout.
 * Uses the S8 paid invoice's producer.
 */
async function runS10(paidInvoice) {
  const producerId = paidInvoice.producerId;
  const { status: stStatus, body: statements } = await jsonFetch(
    `${INVOICING_URL}/internal/v1/statements?participantId=${producerId}`,
  );
  assert.equal(stStatus, 200, JSON.stringify(statements));
  const statement = (statements ?? []).find((s) => s.period === "2026-11") ?? statements[0];
  assert.ok(statement, "producer statement missing");

  const openIds = (statement.invoices ?? [])
    .filter((i) => i.producerId === producerId && i.status === "Open")
    .map((i) => i.invoiceId);

  const voided = [];
  for (const invoiceId of openIds) {
    const { status, body } = await jsonFetch(
      `${INVOICING_URL}/internal/v1/invoices/${invoiceId}/status`,
      {
        method: "POST",
        body: JSON.stringify({
          status: "Void",
          reason: "INT-461 money-path e2e A2 payout gate cleanup",
          actorId: MANAGER,
          communityId: COMMUNITY,
        }),
      },
    );
    assert.equal(status, 200, JSON.stringify(body));
    voided.push(body);
  }

  const { status: acctStatus, body: account } = await jsonFetch(
    `${PAYMENTS_URL}/internal/v1/payment-accounts/${producerId}`,
  );
  assert.equal(acctStatus, 200, JSON.stringify(account));
  assert.ok(
    typeof account.pspAccountRef === "string" && account.pspAccountRef.startsWith("acct_"),
  );

  // Stripe test: immediately-available funds on the Connect account.
  const seed = await stripe(
    "POST",
    "/charges",
    {
      amount: "2000",
      currency: "eur",
      source: "tok_bypassPending",
      description: "INT-461 money-path e2e available-balance seed",
    },
    account.pspAccountRef,
  );

  // INT-465 — actor+currency request is idempotent when 2026-11 already has an
  // active payout from a prior money-path run on the durable payments store.
  const { status: poStatus, body: payout } = await jsonFetch(
    `${PAYMENTS_URL}/internal/v1/payouts:request`,
    {
      method: "POST",
      body: JSON.stringify({ actorId: producerId, currency: "EUR" }),
    },
  );
  assert.equal(poStatus, 200, JSON.stringify(payout));
  assert.ok(
    ["in_transit", "paid", "requested"].includes(payout.payoutStatus),
    JSON.stringify(payout),
  );

  // Best-effort Stripe po_* lookup for evidence.
  let stripePayout = null;
  try {
    const list = await stripe("GET", "/payouts?limit=3", null, account.pspAccountRef);
    stripePayout = list.data?.[0] ?? null;
  } catch {
    /* evidence only */
  }

  writeEvidence(
    "s10-payout",
    {
      producerId,
      voidOpenIds: openIds,
      seedChargeId: seed.id,
    },
    {
      voided,
      payout,
      stripePayout: stripePayout
        ? { id: stripePayout.id, amount: stripePayout.amount, status: stripePayout.status }
        : null,
    },
  );
  console.log(
    JSON.stringify({
      step: "S10",
      payoutId: payout.payoutId,
      payoutStatus: payout.payoutStatus,
      amount: payout.amount,
      stripePayoutId: stripePayout?.id ?? null,
    }),
  );
  return { payout, stripePayout };
}

async function main() {
  headers = await buildInternalServiceHeaders({
    sub: "int-461-money-path-e2e",
    roles: "service,operator",
  });
  assert.ok(headers.Authorization, "service JWT missing — check KEYCLOAK_*");

  const [s8InvoiceId, s9InvoiceId] = freshInvoiceIds();
  const s8 = await runS8(s8InvoiceId);
  await runS9(s9InvoiceId);
  await runS10(s8.invoice);

  console.log(
    JSON.stringify({
      msg: "cluster money-path e2e passed",
      run_path: "stripe-test",
      scenarios: ["S8", "S9", "S10"],
    }),
  );
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
