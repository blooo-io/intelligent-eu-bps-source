#!/usr/bin/env node
/**
 * INT-302 / INT-303 / INT-408 — materialise public.v1 as JSON for vitepress-openapi.
 * Bundles external `$ref`s (e.g. bearerAuth → components/schemas.yaml) so the
 * static JSON is self-contained; vitepress-openapi cannot resolve file `$ref`s
 * at runtime and would otherwise drop Authorization on Try it out (INT-408).
 * Copies the YAML unchanged for download; enriches `servers` in the JSON only
 * so Try it out / samples can target absolute gateways (relative `/v1` alone
 * falls back to http://localhost in the playground).
 *
 * Override sample hosts with DOCS_API_SERVERS (JSON array of {url, description}).
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const repoRoot = path.resolve(siteRoot, "../..");
const openapiSrc = path.join(repoRoot, "contracts/openapi/public.v1.yaml");
const outDir = path.join(siteRoot, "public/openapi");
const jsonOut = path.join(outDir, "public.v1.json");
const yamlOut = path.join(outDir, "public.v1.yaml");
const redocly = path.join(repoRoot, "node_modules/@redocly/cli/bin/cli.js");

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
if (!existsSync(redocly)) {
  console.error(`missing @redocly/cli at ${redocly} (pnpm install from repo root)`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
// Keep the downloadable YAML identical to the contract (external $refs OK for humans).
cpSync(openapiSrc, yamlOut);

// INT-408 — bundle so securitySchemes / responses resolve inside the JSON consumed by
// vitepress-openapi (in-document $ref only; no filesystem lookup at runtime).
const tmpDir = mkdtempSync(path.join(tmpdir(), "site-openapi-"));
const bundledYaml = path.join(tmpDir, "public.v1.bundled.yaml");
try {
  execFileSync(
    process.execPath,
    [redocly, "bundle", openapiSrc, "-o", bundledYaml],
    { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
  );
  const doc = parseYaml(readFileSync(bundledYaml, "utf8"));
  doc.servers = docsServers();

  const bearer = doc.components?.securitySchemes?.bearerAuth;
  if (!bearer || bearer.type !== "http" || bearer.scheme !== "bearer") {
    console.error(
      "bundled OpenAPI missing resolved bearerAuth http scheme:",
      JSON.stringify(bearer),
    );
    process.exit(1);
  }
  if (bearer.$ref) {
    console.error("bundled OpenAPI still has external bearerAuth $ref:", bearer.$ref);
    process.exit(1);
  }

  writeFileSync(jsonOut, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(
    JSON.stringify({
      msg: "openapi prepared for vitepress-openapi",
      jsonOut,
      yamlOut,
      paths: Object.keys(doc.paths || {}).length,
      servers: doc.servers.map((s) => s.url),
      bearerAuthType: bearer.type,
    }),
  );
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
