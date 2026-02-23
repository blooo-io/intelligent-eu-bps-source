import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  STRIPE_SEED_PATHS,
  STRIPE_WEB_SEED_PATH,
  ESO_NAMESPACE,
  buildStripeKvFields,
  buildStripeWebKvFields,
  checkStripeSeedLayout,
  printStripeSeedSteps,
} from "./openbao-seed-stripe-test.mjs";

test("INT-186 Stripe seed targets payments and invoicing", () => {
  assert.deepEqual(STRIPE_SEED_PATHS, ["dev/payments", "dev/invoicing"]);
});

test("INT-191 Stripe seed also targets web for publishable key", () => {
  assert.equal(STRIPE_WEB_SEED_PATH, "dev/web");
});

test("INT-186 buildStripeKvFields accepts test keys and optional Connect secret", () => {
  const fields = buildStripeKvFields({
    stripeSecretKey: "sk_test_abc",
    stripeWebhookSecret: "whsec_platform",
    stripeConnectWebhookSecret: "whsec_connect",
  });
  assert.ok(fields.includes("stripe_secret_key=sk_test_abc"));
  assert.ok(fields.includes("stripe_webhook_secret=whsec_platform"));
  assert.ok(fields.includes("stripe_connect_webhook_secret=whsec_connect"));
  assert.ok(fields.includes("seeded=true"));
});

test("INT-191 buildStripeWebKvFields accepts pk_test only", () => {
  const fields = buildStripeWebKvFields({
    stripePublishableKey: "pk_test_abc",
  });
  assert.ok(fields.includes("stripe_publishable_key=pk_test_abc"));
  assert.throws(
    () => buildStripeWebKvFields({ stripePublishableKey: "pk_live_nope" }),
    /pk_test_/,
  );
});

test("INT-186 buildStripeKvFields rejects live or missing keys", () => {
  assert.throws(
    () =>
      buildStripeKvFields({
        stripeSecretKey: "sk_live_nope",
        stripeWebhookSecret: "whsec_x",
      }),
    /sk_test_/,
  );
  assert.throws(
    () =>
      buildStripeKvFields({
        stripeSecretKey: "sk_test_ok",
        stripeWebhookSecret: "not-a-whsec",
      }),
    /whsec_/,
  );
});

test("INT-186 seed script reads bootstrap root_token key", async () => {
  const source = await readFile(new URL("./openbao-seed-stripe-test.mjs", import.meta.url), "utf8");
  assert.match(source, /jsonpath=\{\.data\.root_token\}/);
  assert.doesNotMatch(source, /sk_test_[A-Za-z0-9]{20,}/);
  assert.doesNotMatch(source, /whsec_[A-Za-z0-9]{20,}/);
  assert.doesNotMatch(source, /pk_test_[A-Za-z0-9]{20,}/);
});

test("INT-191 seed apply force-syncs ExternalSecrets including web", async () => {
  assert.equal(ESO_NAMESPACE, "int-apps");
  const source = await readFile(new URL("./openbao-seed-stripe-test.mjs", import.meta.url), "utf8");
  assert.match(source, /force-sync=/);
  assert.match(source, /forceExternalSecretSync/);
  assert.match(source, /externalsecret/);
  assert.match(source, /"web"/);
});

test("INT-186/191 print and README layout", async () => {
  const printed = printStripeSeedSteps();
  assert.match(printed, /openbao-seed-stripe-test\.mjs/);
  assert.match(printed, /STRIPE_SECRET_KEY/);
  assert.match(printed, /STRIPE_PUBLISHABLE_KEY/);
  assert.match(printed, /STRIPE_WEBHOOK_SECRET/);
  assert.equal(printed.includes("sk_test_abc"), false);
  await checkStripeSeedLayout();
});
