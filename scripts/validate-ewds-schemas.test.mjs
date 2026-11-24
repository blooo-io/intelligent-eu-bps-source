/**
 * INT-101 / INT-423 — EWDS topic examples and negative fixtures (REQ-048, NFR-004, A7-bis).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  validateEwdsSchemas,
  validateInvalidFixtures,
} from "./validate-ewds-schemas.mjs";

const topics = path.resolve("docs/architecture/ewds-topics");

test("REQ-048 UAT-068: all 7 EWDS topic examples validate", async () => {
  const r = await validateEwdsSchemas();
  assert.deepEqual(r.map((x) => x.name).sort(), [
    "billingCommandReply",
    "billingCommandRequest",
    "billingInvoice",
    "billingKycStatus",
    "billingPayment",
    "billingPayout",
    "billingStatement",
  ]);
  for (const x of r) {
    assert.equal(x.ok, true, `${x.name}: ${x.errors.join("; ")}`);
  }
});

test("NFR-004: invalid fixtures are rejected", async () => {
  const r = await validateInvalidFixtures();
  assert.ok(r.length >= 6);
  for (const x of r) assert.equal(x.rejected, true, x.file);
});

test("REQ-004: billingInvoice accepts gridFeeAmount 3.5", async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = JSON.parse(
    await readFile(
      path.join(topics, "billingInvoice.v1.0.0.schema.json"),
      "utf8",
    ),
  );
  const example = JSON.parse(
    await readFile(path.join(topics, "billingInvoice.example.json"), "utf8"),
  );
  example.gridFeeAmount = 3.5;
  example.gridFeeStatus = "applied";
  const validate = ajv.compile(schema);
  assert.equal(validate(example), true, ajv.errorsText(validate.errors));
});

test("A7-bis: command reply rejects a non-Stripe hosted handoff URL", async () => {
  const r = await validateInvalidFixtures();
  const blooo = r.find((x) => x.file.endsWith("billingCommandReply__blooo-url.json"));
  assert.ok(blooo, "missing billingCommandReply__blooo-url.json fixture");
  assert.equal(blooo.rejected, true, blooo.file);
});

test("A7-bis: command reply rejects embedded handoff carrying a url", async () => {
  const r = await validateInvalidFixtures();
  const bad = r.find((x) =>
    x.file.endsWith("billingCommandReply__embedded-with-url.json"),
  );
  assert.ok(bad, "missing billingCommandReply__embedded-with-url.json fixture");
  assert.equal(bad.rejected, true, bad.file);
});

test("billingInvoice and billingPayment examples validate (INT-101 legacy)", async () => {
  const results = await validateEwdsSchemas();
  for (const name of ["billingInvoice", "billingPayment"]) {
    const row = results.find((x) => x.name === name);
    assert.equal(row?.ok, true, `${name}: ${row?.errors?.join("; ")}`);
  }
});