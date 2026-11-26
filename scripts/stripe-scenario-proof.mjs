#!/usr/bin/env node
/**
 * INT-458 — live Stripe **test mode** proofs for money/KYC scenarios.
 *
 * Creates real Stripe test objects (Connect account, Checkout Session, Payout
 * on a connected account when possible) and writes evidence packs:
 *   docs/testing/evidence/<date>/stripe-s04|s08|s10/{input,output}.json
 *
 * Requires STRIPE_SECRET_KEY=sk_test_*. Never logs the secret.
 *
 * Usage:
 *   node scripts/stripe-scenario-proof.mjs
 *   EVIDENCE_DIR=docs/testing/evidence/2026-11-26 node scripts/stripe-scenario-proof.mjs
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!key.startsWith("sk_test_")) {
  console.error(
    JSON.stringify({
      error: "STRIPE_SECRET_KEY must be a Stripe test secret (sk_test_*)",
    }),
  );
  process.exit(1);
}

const day = new Date().toISOString().slice(0, 10);
const root =
  process.env.EVIDENCE_DIR?.trim() ||
  path.join("docs/testing/evidence", day);

async function stripe(method, apiPath, body) {
  const headers = {
    authorization: `Bearer ${key}`,
    "stripe-version": "2024-11-20.acacia",
  };
  /** @type {RequestInit} */
  const init = { method, headers };
  if (body && method !== "GET") {
    headers["content-type"] = "application/x-www-form-urlencoded";
    init.body = new URLSearchParams(body).toString();
  }
  const res = await fetch(`https://api.stripe.com/v1${apiPath}`, init);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `Stripe ${method} ${apiPath} → ${res.status}: ${json.error?.message ?? JSON.stringify(json)}`,
    );
  }
  return json;
}

function writePack(name, input, output, notes) {
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "input.json"), `${JSON.stringify(input, null, 2)}\n`);
  writeFileSync(
    path.join(dir, "output.json"),
    `${JSON.stringify({ ...output, notes }, null, 2)}\n`,
  );
  return {
    id: name,
    run_path: "stripe-test",
    input: `${name}/input.json`,
    output: `${name}/output.json`,
    notes,
  };
}

function upsertIndex(entries) {
  const indexFile = path.join(root, "stripe-proof-index.json");
  const prev = existsSync(indexFile)
    ? JSON.parse(readFileSync(indexFile, "utf8"))
    : { jira: ["INT-458"], scenarios: [] };
  const byId = new Map(prev.scenarios.map((s) => [s.id, s]));
  for (const e of entries) byId.set(e.id, e);
  const next = {
    generatedAt: new Date().toISOString(),
    timezone: "Europe/Paris",
    jira: ["INT-458"],
    run_path: "stripe-test",
    scenarios: [...byId.values()],
  };
  writeFileSync(indexFile, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

const entries = [];

// S4 — KYC / Connect onboarding account (test mode).
{
  const input = {
    scenario: "S4",
    api: "POST /v1/accounts",
    type: "express",
    country: "FR",
    capabilities: { card_payments: "requested", transfers: "requested" },
  };
  const account = await stripe("POST", "/accounts", {
    type: "express",
    country: "FR",
    "capabilities[card_payments][requested]": "true",
    "capabilities[transfers][requested]": "true",
    "metadata[scenario]": "S4",
    "metadata[jira]": "INT-458",
  });
  const link = await stripe("POST", "/account_links", {
    account: account.id,
    refresh_url: "https://example.invalid/reauth",
    return_url: "https://example.invalid/return",
    type: "account_onboarding",
  });
  entries.push(
    writePack(
      "stripe-s04",
      input,
      {
        accountId: account.id,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        accountLinkUrlPrefix: String(link.url).slice(0, 48),
      },
      "Live Stripe test Connect Express account + Account Link (KYC handoff).",
    ),
  );
}

// S8 — pay invoice handoff via Checkout Session (test mode).
{
  const product = await stripe("POST", "/products", {
    name: "INT-458 S8 evidence invoice energy",
  });
  const price = await stripe("POST", "/prices", {
    product: product.id,
    unit_amount: "1081",
    currency: "chf",
  });
  const input = {
    scenario: "S8",
    api: "POST /v1/checkout/sessions",
    mode: "payment",
    priceId: price.id,
    amount: "10.81 CHF",
  };
  const session = await stripe("POST", "/checkout/sessions", {
    mode: "payment",
    success_url: "https://example.invalid/success",
    cancel_url: "https://example.invalid/cancel",
    "line_items[0][price]": price.id,
    "line_items[0][quantity]": "1",
    "metadata[scenario]": "S8",
    "metadata[jira]": "INT-458",
  });
  entries.push(
    writePack(
      "stripe-s08",
      input,
      {
        checkoutSessionId: session.id,
        payment_status: session.payment_status,
        urlPrefix: String(session.url).slice(0, 48),
        currency: session.currency,
        amount_total: session.amount_total,
      },
      "Live Stripe test Checkout Session — real cs_test_* id (pay handoff).",
    ),
  );
}

// S10 — payout capability check on the S4 Connect account (test mode).
{
  const accountId = entries.find((e) => e.id === "stripe-s04")
    ? JSON.parse(
        readFileSync(path.join(root, "stripe-s04/output.json"), "utf8"),
      ).accountId
    : null;
  const input = {
    scenario: "S10",
    api: "GET /v1/accounts/{id} + balance",
    accountId,
  };
  const account = await stripe("GET", `/accounts/${accountId}`);
  const balance = await stripe("GET", "/balance");
  entries.push(
    writePack(
      "stripe-s10",
      input,
      {
        accountId,
        payouts_enabled: account.payouts_enabled,
        balanceAvailable: balance.available,
        balancePending: balance.pending,
        note:
          "Payout create needs funded Connect balance + completed KYC; this pack proves live Stripe account/balance APIs for the payout path.",
      },
      "Live Stripe test account + platform balance probe for payout path.",
    ),
  );
}

const index = upsertIndex(entries);
console.log(
  JSON.stringify(
    {
      msg: "stripe scenario proof written",
      root,
      run_path: "stripe-test",
      scenarios: index.scenarios.map((s) => s.id),
    },
    null,
    2,
  ),
);
