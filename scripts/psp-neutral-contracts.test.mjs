/**
 * INT-423 WS5 Task 5.1 — PSP-neutral contract property names and TE-2 / ER1.4 fields (REQ-046).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";

/** Walk every OpenAPI / AsyncAPI `properties` map and collect keys. */
function collectPropertyNames(node, keys = []) {
  if (node === null || typeof node !== "object") return keys;
  if (Array.isArray(node)) {
    for (const item of node) collectPropertyNames(item, keys);
    return keys;
  }
  if (Object.hasOwn(node, "properties") && typeof node.properties === "object") {
    for (const name of Object.keys(node.properties)) {
      keys.push(name);
      collectPropertyNames(node.properties[name], keys);
    }
  }
  for (const value of Object.values(node)) {
    if (value !== node.properties) collectPropertyNames(value, keys);
  }
  return keys;
}

test("REQ-046 contracts are PSP-neutral and expose TE-2/ER1.4 fields [INT-423]", async () => {
  for (const f of [
    "contracts/openapi/public.v1.yaml",
    "contracts/openapi/internal/payments.v1.yaml",
    "contracts/asyncapi/payments.v1.yaml",
  ]) {
    const doc = parseYaml(await readFile(f, "utf8"));
    const keys = collectPropertyNames(doc);
    assert.deepEqual(
      keys.filter((k) => /^stripe|Stripe/.test(k)),
      [],
      f,
    );
  }
  const pub = parseYaml(await readFile("contracts/openapi/public.v1.yaml", "utf8"));
  assert.equal(pub.paths["/reports/payment-methods"].get.operationId, "getPaymentMethodReport");
  assert.deepEqual(
    Object.keys(pub.components.schemas.PaymentMethodStats.properties).sort(),
    [
      "averageFee",
      "count",
      "failedCount",
      "feeCurrency",
      "feeMissingCount",
      "medianProcessingTimeMs",
      "method",
      "pendingCount",
      "succeededCount",
      "successRate",
      "totalFee",
    ],
  );
  const evt = parseYaml(await readFile("contracts/asyncapi/payments.v1.yaml", "utf8"));
  const data = evt.components.messages.PaymentStatusChanged.payload.allOf[1].properties.data;
  for (const k of ["amount", "currency", "initiatedAt", "settledAt", "feeAmount", "feeCurrency"]) {
    assert.ok(data.properties[k], k);
  }
  assert.deepEqual(data.properties.method.enum, ["card", "sepa_debit"]);
});

test.todo("WS5 Task 5.6: payments domain sources have no stripe-prefixed identifiers", () => {
  // Domain TypeScript neutrality is enforced in Task 5.6 (psp.port split).
});