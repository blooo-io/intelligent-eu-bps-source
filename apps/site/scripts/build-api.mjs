#!/usr/bin/env node
/**
 * INT-301 — bake Redoc OpenAPI into the VitePress public/ tree (full merge with guides).
 * Same contract and tooling as apps/docs-portal (INT-244 / TD-13).
 */
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const repoRoot = path.resolve(siteRoot, "../..");
const openapiSrc = path.join(repoRoot, "contracts/openapi/public.v1.yaml");
const publicDir = path.join(siteRoot, "public");
const apiOutDir = path.join(publicDir, "api");
const openapiOutDir = path.join(publicDir, "openapi");

if (!existsSync(openapiSrc)) {
  console.error(`missing OpenAPI contract: ${openapiSrc}`);
  process.exit(1);
}

const redocly = path.join(repoRoot, "node_modules/@redocly/cli/bin/cli.js");
if (!existsSync(redocly)) {
  console.error(
    "missing @redocly/cli at repo root — run pnpm install from the monorepo root",
  );
  process.exit(1);
}

rmSync(apiOutDir, { recursive: true, force: true });
rmSync(openapiOutDir, { recursive: true, force: true });
mkdirSync(apiOutDir, { recursive: true });
mkdirSync(openapiOutDir, { recursive: true });

cpSync(openapiSrc, path.join(openapiOutDir, "public.v1.yaml"));

const apiHtml = path.join(apiOutDir, "index.html");
execFileSync(
  process.execPath,
  [
    redocly,
    "build-docs",
    openapiSrc,
    "-o",
    apiHtml,
    "--title",
    "INTELLIGENT Billing API",
    "--disableGoogleFont",
  ],
  { cwd: repoRoot, stdio: "inherit" },
);

console.log(
  JSON.stringify({
    msg: "site OpenAPI portal built",
    apiHtml,
    openapi: path.join(openapiOutDir, "public.v1.yaml"),
  }),
);
