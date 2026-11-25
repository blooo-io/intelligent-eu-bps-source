#!/usr/bin/env node
/**
 * INT-101 / INT-423 — validate EWDS draft topic examples against their JSON Schemas.
 * Replaces npx ajv-cli in CI: workspace-hoisted ajv-formats (ESM) breaks
 * ajv-cli's `-c ajv-formats` CommonJS loader after @intelligent/mocks is added.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const here = fileURLToPath(import.meta.url);

const root = path.resolve(path.dirname(here), "..");
const topics = path.join(root, "docs/architecture/ewds-topics");
const invalidDir = path.join(topics, "fixtures/invalid");

export const names = [
  "billingStatement",
  "billingInvoice",
  "billingPayment",
  "billingPayout",
  "billingKycStatus",
  "billingCommandRequest",
  "billingCommandReply",
  "actor",
  "tariff",
];

function compileAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

export async function validateEwdsSchemas() {
  const ajv = compileAjv();
  const results = [];
  for (const name of names) {
    const schema = JSON.parse(
      await readFile(path.join(topics, `${name}.v1.0.0.schema.json`), "utf8"),
    );
    const example = JSON.parse(
      await readFile(path.join(topics, `${name}.example.json`), "utf8"),
    );
    const validate = ajv.compile(schema);
    const ok = validate(example);
    results.push({
      name,
      ok,
      errors: ok
        ? []
        : (validate.errors ?? []).map(
            (e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`,
          ),
    });
  }
  return results;
}

/**
 * Each invalid fixture is named `<schema>__<case>.json` and must fail validation.
 */
export async function validateInvalidFixtures() {
  const ajv = compileAjv();
  const schemaCache = new Map();
  let files;
  try {
    files = (await readdir(invalidDir))
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch {
    return [];
  }

  const results = [];
  for (const file of files) {
    const schemaName = file.split("__")[0];
    const schemaPath = path.join(topics, `${schemaName}.v1.0.0.schema.json`);
    let validate = schemaCache.get(schemaName);
    if (!validate) {
      const schema = JSON.parse(await readFile(schemaPath, "utf8"));
      validate = ajv.compile(schema);
      schemaCache.set(schemaName, validate);
    }
    const doc = JSON.parse(await readFile(path.join(invalidDir, file), "utf8"));
    const ok = validate(doc);
    results.push({
      file,
      rejected: !ok,
      errors: ok
        ? (validate.errors ?? []).map(
            (e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`,
          )
        : [],
    });
  }
  return results;
}

const isMain = Boolean(process.argv[1]) && here === path.resolve(process.argv[1]);

if (isMain) {
  const results = await validateEwdsSchemas();
  let failed = false;
  for (const r of results) {
    if (r.ok) {
      console.log(`${r.name}.example.json valid`);
    } else {
      failed = true;
      console.error(
        `${r.name}.example.json invalid:\n  ${r.errors.join("\n  ")}`,
      );
    }
  }

  const invalid = await validateInvalidFixtures();
  for (const r of invalid) {
    if (r.rejected) {
      console.log(`${r.file} rejected as expected`);
    } else {
      failed = true;
      console.error(`${r.file} should be invalid but passed validation`);
    }
  }

  process.exit(failed ? 1 : 0);
}