/**
 * INT-423 WS5 Task 5.1 — PSP-neutral contract property names and TE-2 / ER1.4 fields (REQ-046).
 * Pure string asserts: runs before pnpm install in scripts/run-tests.mjs.
 * INT-455 — public OpenAPI withdrawn.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("REQ-046 contracts are PSP-neutral (INT-423 / INT-455)", async () => {
  for (const f of [
    "contracts/openapi/internal/payments.v1.yaml",
    "contracts/asyncapi/payments.v1.yaml",
  ]) {
    const text = await readFile(f, "utf8");
    // Property keys only (avoid matching prose that mentions Stripe).
    assert.doesNotMatch(text, /^\s+stripe[A-Za-z0-9]*:/m, f);
    assert.doesNotMatch(text, /^\s+Stripe[A-Za-z0-9]*:/m, f);
  }

  const evt = await readFile("contracts/asyncapi/payments.v1.yaml", "utf8");
  assert.match(evt, /PaymentStatusChanged:[\s\S]*?initiatedAt:/);
  assert.match(evt, /PaymentStatusChanged:[\s\S]*?settledAt:/);
  assert.match(evt, /PaymentStatusChanged:[\s\S]*?feeAmount:/);
  assert.match(evt, /PaymentStatusChanged:[\s\S]*?feeCurrency:/);
  assert.match(evt, /method:[\s\S]*?enum:\s*\[card,\s*sepa_debit\]/);
});

test("WS5 Task 5.6: payments domain sources have no stripe-prefixed identifiers [INT-424]", async () => {
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  async function walk(dir) {
    const out = [];
    for (const ent of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) out.push(...(await walk(p)));
      else if (ent.name.endsWith(".ts") && !ent.name.endsWith(".spec.ts")) out.push(p);
    }
    return out;
  }
  const roots = [
    "services/payments/src/domain",
    "services/payments/src/payments",
    "services/payments/src/ports",
  ];
  const files = (await Promise.all(roots.map(walk))).flat();
  assert.ok(files.length > 0, "expected domain/payments/ports sources");
  for (const f of files) {
    const src = await readFile(f, "utf8");
    assert.doesNotMatch(src, /stripe[A-Z]\w*/, f);
  }
});