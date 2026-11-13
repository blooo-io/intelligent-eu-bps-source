import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  DEV_PLACEHOLDER_PATHS,
  DEV_PLACEHOLDER_FIELDS,
  MODULE_SERVICE_JWT_PATHS,
  STRIPE_PROTECTED_PATHS,
  checkSeedLayout,
  hasRealStripeCredentials,
  mergePlaceholderFields,
  printSeedSteps,
} from "./openbao-seed-dev-placeholders.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("dev placeholder paths cover modules, debezium, nats, keycloak and apisix (INT-133 / INT-160 / INT-161)", () => {
  assert.ok(DEV_PLACEHOLDER_PATHS.includes("dev/web"));
  assert.ok(DEV_PLACEHOLDER_PATHS.includes("dev/payments"));
  assert.ok(DEV_PLACEHOLDER_PATHS.includes("dev/cd-smoke"));
  assert.ok(DEV_PLACEHOLDER_PATHS.includes("dev/debezium-server"));
  assert.ok(DEV_PLACEHOLDER_PATHS.includes("platform/nats/accounts"));
  assert.ok(DEV_PLACEHOLDER_PATHS.includes("platform/keycloak"));
  assert.ok(DEV_PLACEHOLDER_PATHS.includes("platform/apisix"));
  assert.ok(DEV_PLACEHOLDER_PATHS.includes("platform/sonarqube"));
  assert.ok(DEV_PLACEHOLDER_PATHS.includes("platform/ddhub"));
  assert.equal(
    DEV_PLACEHOLDER_PATHS.some((p) => /sk_live|sk_test|whsec_/.test(p)),
    false,
  );
});

test("seed layout is documented without secret material", async () => {
  const summary = await checkSeedLayout(root);
  assert.ok(summary.pathCount >= 15);
  const text = printSeedSteps();
  assert.match(text, /seeded=true/);
  assert.match(text, /INT-157/);
  assert.equal(text.includes("sk_test"), false);
  assert.equal(text.includes("whsec_"), false);
});

test("platform README references the seed script", async () => {
  const text = await readFile(
    path.join(root, "deploy/platform/README.md"),
    "utf8",
  );
  assert.match(text, /openbao-seed-dev-placeholders\.mjs/);
});

test("CLI argv Set uses has not includes for --print/--apply/--check", async () => {
  const source = await readFile(
    path.join(root, "scripts/openbao-seed-dev-placeholders.mjs"),
    "utf8",
  );
  assert.match(source, /const args = new Set\(process\.argv\.slice\(2\)\)/);
  assert.match(source, /args\.has\("--check"\)/);
  assert.match(source, /args\.has\("--print"\)/);
  assert.match(source, /args\.has\("--apply"\)/);
  assert.equal(source.includes('args.includes("--print")'), false);
});

test("INT-287 / INT-325 placeholder seed includes module-service client secret on Nest paths", () => {
  assert.ok(MODULE_SERVICE_JWT_PATHS.includes("dev/scheduler"));
  assert.ok(MODULE_SERVICE_JWT_PATHS.includes("dev/settlement"));
  for (const p of MODULE_SERVICE_JWT_PATHS) {
    const fields = DEV_PLACEHOLDER_FIELDS[p] ?? [];
    assert.ok(
      fields.some((f) => f.startsWith("KEYCLOAK_SERVICE_CLIENT_SECRET=")),
      p,
    );
  }
  const participants = DEV_PLACEHOLDER_FIELDS["dev/participants"] ?? [];
  assert.ok(
    participants.some((f) => f.startsWith("KEYCLOAK_ADMIN_CLIENT_SECRET=")),
    "participants admin client secret in OpenBao",
  );
});

test("INT-295 placeholder seed detects real Stripe credentials to protect", () => {
  assert.deepEqual(STRIPE_PROTECTED_PATHS.sort(), [
    "dev/invoicing",
    "dev/payments",
    "dev/web",
  ].sort());
  assert.equal(
    hasRealStripeCredentials({ seeded: "true", stripe_secret_key: "sk_test_abc" }),
    true,
  );
  assert.equal(
    hasRealStripeCredentials({ seeded: "true", stripe_publishable_key: "pk_test_abc" }),
    true,
  );
  assert.equal(
    hasRealStripeCredentials({ seeded: "true", stripe_secret_key: "dev-only-replace-me" }),
    false,
  );
  assert.equal(hasRealStripeCredentials({ seeded: "true" }), false);
});

test("INT-329 merges Keycloak secrets without wiping Stripe keys", () => {
  const merged = mergePlaceholderFields(
    {
      seeded: "true",
      stripe_secret_key: "sk_test_keep_me",
      stripe_webhook_secret: "whsec_keep_me",
    },
    [
      "KEYCLOAK_SERVICE_CLIENT_SECRET=dev-module-service-replace-me",
      "seeded=true",
    ],
  );
  assert.equal(merged.stripe_secret_key, "sk_test_keep_me");
  assert.equal(merged.stripe_webhook_secret, "whsec_keep_me");
  assert.equal(
    merged.KEYCLOAK_SERVICE_CLIENT_SECRET,
    "dev-module-service-replace-me",
  );
  assert.equal(merged.seeded, "true");
});

test("INT-377 keeps a real DDHub vault token and seeds the NATS account", () => {
  const ddhub = mergePlaceholderFields(
    { seeded: "true", vault_token: "real-token" },
    DEV_PLACEHOLDER_FIELDS["platform/ddhub"],
  );
  assert.equal(ddhub.vault_token, "real-token");

  const fresh = mergePlaceholderFields({}, DEV_PLACEHOLDER_FIELDS["platform/ddhub"]);
  assert.equal(fresh.vault_token, "dev-only-replace-me");

  const nats = mergePlaceholderFields(
    { seeded: "true" },
    DEV_PLACEHOLDER_FIELDS["platform/nats/accounts"],
  );
  assert.equal(nats.user, "dev");
  assert.match(nats["auth.conf"], /^authorization \{/);
});

test("INT-329 apply path does not skip Stripe-protected KV paths", async () => {
  const source = await readFile(
    path.join(root, "scripts/openbao-seed-dev-placeholders.mjs"),
    "utf8",
  );
  assert.match(source, /mergePlaceholderFields/);
  assert.match(source, /stripePreserved/);
  assert.equal(
    /skipped\.push\(kvPath\)/.test(source),
    false,
    "must not skip Stripe-protected paths entirely",
  );
});
