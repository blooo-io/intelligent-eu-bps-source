#!/usr/bin/env node
/**
 * INT-244 — build static docs portal: landing page + Redocly HTML for public.v1.
 */
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const repoRoot = path.resolve(appRoot, "../..");
const dist = path.join(appRoot, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

cpSync(path.join(appRoot, "public"), dist, { recursive: true });

const openapiSrc = path.join(repoRoot, "contracts/openapi/public.v1.yaml");
const openapiDest = path.join(dist, "public.v1.yaml");
cpSync(openapiSrc, openapiDest);

const redocly = path.join(repoRoot, "node_modules/@redocly/cli/bin/cli.js");
// INT-366 — Redocly CLI 2.71 dropped the Google Fonts switch; the page no longer loads those fonts.
execFileSync(
  process.execPath,
  [
    redocly,
    "build-docs",
    openapiSrc,
    "-o",
    path.join(dist, "api.html"),
    "--title",
    "INTELLIGENT Billing API",
  ],
  { cwd: repoRoot, stdio: "inherit" },
);

const landing = readFileSync(path.join(dist, "index.html"), "utf8");
writeFileSync(
  path.join(dist, "index.html"),
  landing.replaceAll("{{BUILD_STAMP}}", new Date().toISOString().slice(0, 10)),
);

console.log(JSON.stringify({ msg: "docs-portal built", dist }));
