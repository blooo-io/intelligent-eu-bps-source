/**
 * A10.6 / Task 1.21 — V1 journal reset packaging (INT-440).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("A10.6: reset covers every V1 journal and is off by default", async () => {
  const sql = await readFile(
    "deploy/charts/cnpg-int-data/sql/reset-v1-journals.sql",
    "utf8",
  );
  for (const t of [
    "settlement_settlements",
    "settlement_runs",
    "settlement_carry",
    "invoices",
    "statements",
    "payments",
    "payouts",
    "payment_accounts",
  ]) {
    assert.match(sql, new RegExp(`TRUNCATE[^;]*\\b${t}\\b`));
  }
  assert.match(sql, /DROP TABLE IF EXISTS connected_customers/);
  assert.match(
    await readFile("deploy/charts/cnpg-int-data/values.yaml", "utf8"),
    /resetV1Journals:\s*\n\s*enabled: false/,
  );
  assert.match(
    await readFile(
      "deploy/charts/cnpg-int-data/templates/reset-v1-journals.yaml",
      "utf8",
    ),
    /\{\{- if \.Values\.resetV1Journals\.enabled \}\}[\s\S]*argocd\.argoproj\.io\/hook: PostSync/,
  );
});
