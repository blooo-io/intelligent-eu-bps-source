#!/usr/bin/env node
/**
 * INT-302 / INT-303 — materialise public.v1 as JSON for vitepress-openapi.
 * Copies the YAML unchanged for download; enriches `servers` in the JSON only
 * so Try it out / samples can target absolute gateways (relative `/v1` alone
 * falls back to http://localhost in the playground).
 *
 * Override sample hosts with DOCS_API_SERVERS (JSON array of {url, description}).
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const repoRoot = path.resolve(siteRoot, "../..");
const openapiSrc = path.join(repoRoot, "contracts/openapi/public.v1.yaml");
const outDir = path.join(siteRoot, "public/openapi");
const jsonOut = path.join(outDir, "public.v1.json");
const yamlOut = path.join(outDir, "public.v1.yaml");

/** Default playground servers for the docs site (not written into the contract). */
const DEFAULT_DOCS_SERVERS = [
  {
    url: "https://api.dev.intelligent-eu-bp.blooo.dev/v1",
    description: "Upstream sample gateway (dev) — OIDC bearer required",
  },
  {
    url: "/v1",
    description: "Relative path (same origin as your API gateway)",
  },
  {
    url: "http://localhost/v1",
    description: "Local gateway",
  },
];

function docsServers() {
  const raw = process.env.DOCS_API_SERVERS?.trim();
  if (!raw) return DEFAULT_DOCS_SERVERS;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("must be a non-empty JSON array");
    }
    return parsed;
  } catch (err) {
    console.error(`invalid DOCS_API_SERVERS: ${err.message}`);
    process.exit(1);
  }
}

if (!existsSync(openapiSrc)) {
  console.error(`missing OpenAPI contract: ${openapiSrc}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const doc = parseYaml(readFileSync(openapiSrc, "utf8"));
// Keep the downloadable YAML identical to the contract; enrich JSON for the UI.
cpSync(openapiSrc, yamlOut);
doc.servers = docsServers();
writeFileSync(jsonOut, `${JSON.stringify(doc, null, 2)}\n`);

console.log(
  JSON.stringify({
    msg: "openapi prepared for vitepress-openapi",
    jsonOut,
    yamlOut,
    paths: Object.keys(doc.paths || {}).length,
    servers: doc.servers.map((s) => s.url),
  }),
);
