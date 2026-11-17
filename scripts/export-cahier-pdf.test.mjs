/**
 * INT-333 — cahier PDF markdown tables must render as HTML <table>, not raw pipes.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mdToHtml, TABLE_SEP } from "./export-cahier-pdf.mjs";

test("TABLE_SEP matches GFM pipe separators (literal hyphen)", () => {
  assert.equal(TABLE_SEP.test("|---|---|---|---|"), true);
  assert.equal(TABLE_SEP.test("| --- | :---: | ---: |"), true);
  assert.equal(TABLE_SEP.test("| Parcours | Persona |"), false);
});

test("mdToHtml turns pipe tables into HTML tables", () => {
  const html = mdToHtml(`## Intro

| Parcours | Persona |
|---|---|
| **A** | Hugo |
| **B** | Léa |
`);
  assert.match(html, /<table>/);
  assert.match(html, /<th>Parcours<\/th>/);
  assert.match(html, /<td><strong>A<\/strong><\/td>/);
  assert.equal(html.includes("|---|"), false);
});

test("mdToHtml keeps fenced JSON as a pre block (INT-398)", () => {
  const html = mdToHtml("```json\n{\n  \"type\": \"early\"\n}\n```\n");
  assert.match(html, /<pre><code>\{/);
  assert.match(html, /"type": "early"/);
  assert.equal(html.includes("```"), false);
});

test("cahier markdown tables convert without leaving raw separators", async () => {
  const md = await readFile(
    "docs/testing/cahier-de-tests-demo-intelligent-billing-and-payment.md",
    "utf8",
  );
  const html = mdToHtml(md);
  const tableCount = (html.match(/<table>/g) || []).length;
  assert.ok(tableCount >= 8, `expected several tables, got ${tableCount}`);
  assert.equal(html.includes("|---|---|"), false);
  assert.match(html, /INTELLIGENT Billing &amp; Payment Login|INTELLIGENT Billing/);
  // INT-398 — each scenario keeps a direct call with the demo payload.
  for (const marker of [
    "PUT /v1/me/profile",
    "8 avenue Victor Hugo, 75016 Paris",
    "POST /v1/me/terms-acceptance",
    "selfBillingMandate",
    "POST /v1/me/payment-account/payment-method",
    "paymentMethodId",
    "GET /v1/me/invoices",
    "POST /v1/invoices/{invoiceId}/payments",
    "POST /v1/data-subject-requests",
    "POST /v1/me/payment-account/onboarding/requirements",
    "thomas.bernard@example.invalid",
    "claire.dubois@example.invalid",
    "POST /v1/communities/c0ffee00-1234-4abc-8def-0123456789ab/billing-runs",
    '"type": "early"',
    "participants:import",
    "camille.rousseau@example.invalid",
    "GET /v1/reconciliation/discrepancies",
    "GET /v1/jobs",
  ]) {
    assert.ok(md.includes(marker), marker);
  }
});

test("exporter lazy-loads Playwright inside exportCahierPdf (CI-safe)", async () => {
  const src = await readFile(
    new URL("./export-cahier-pdf.mjs", import.meta.url),
    "utf8",
  );
  assert.match(src, /require\("@playwright\/test"\)/);
  assert.equal(
    /^\s*const\s*\{\s*chromium\s*\}\s*=\s*require\(/m.test(src.split("export async function exportCahierPdf")[0]),
    false,
    "chromium must not be required at module top-level",
  );
});
