#!/usr/bin/env node
/**
 * INT-325 — fail CI when Keycloak client secrets or UAT passwords appear in
 * GitOps packaging (realm JSON / module Helm values). Operator bootstrap
 * scripts and OpenBao seed may still hold V1 placeholders.
 */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FORBIDDEN_IN_REALM = [
  /Intelligent-UAT-2026!/,
  /"secret"\s*:\s*"(dev-|[^"]*replace-me)/,
  /"credentials"\s*:\s*\[\s*\{\s*"type"\s*:\s*"password"/,
];

const FORBIDDEN_IN_MODULE_VALUES = [
  /^\s*KEYCLOAK_(SERVICE|ADMIN)_CLIENT_SECRET\s*:/m,
];

async function listRealmFiles() {
  const dir = path.join(root, "deploy/charts/keycloak-realms/realms");
  const names = await readdir(dir);
  return names
    .filter((n) => n.endsWith(".json"))
    .map((n) => path.join(dir, n));
}

async function listModuleValues() {
  const charts = path.join(root, "deploy/charts");
  const names = await readdir(charts, { withFileTypes: true });
  const out = [];
  for (const ent of names) {
    if (!ent.isDirectory()) continue;
    const values = path.join(charts, ent.name, "values.yaml");
    try {
      await readFile(values);
      out.push(values);
    } catch {
      // chart without values.yaml
    }
  }
  return out;
}

test("INT-325 — realm JSON has no client secrets or UAT passwords", async () => {
  for (const file of await listRealmFiles()) {
    const text = await readFile(file, "utf8");
    for (const re of FORBIDDEN_IN_REALM) {
      assert.equal(
        re.test(text),
        false,
        `${path.relative(root, file)} matches ${re}`,
      );
    }
    const data = JSON.parse(text);
    for (const client of data.clients ?? []) {
      assert.equal(
        client.secret,
        undefined,
        `${path.relative(root, file)} client ${client.clientId} still has secret`,
      );
    }
    for (const user of data.users ?? []) {
      assert.equal(
        user.credentials,
        undefined,
        `${path.relative(root, file)} user ${user.username} still has credentials`,
      );
    }
  }
});

test("INT-325 — module Helm values do not inline Keycloak client secrets", async () => {
  for (const file of await listModuleValues()) {
    const text = await readFile(file, "utf8");
    for (const re of FORBIDDEN_IN_MODULE_VALUES) {
      assert.equal(
        re.test(text),
        false,
        `${path.relative(root, file)} matches ${re}`,
      );
    }
  }
});
