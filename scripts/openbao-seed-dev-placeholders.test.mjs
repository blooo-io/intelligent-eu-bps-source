import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  DEV_PLACEHOLDER_PATHS,
  checkSeedLayout,
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
