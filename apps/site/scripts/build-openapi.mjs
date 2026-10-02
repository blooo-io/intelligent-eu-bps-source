#!/usr/bin/env node
/**
 * INT-302 — materialise public.v1 as JSON for vitepress-openapi (config + theme).
 * Also copies the YAML for adopters who want the raw contract from the site.
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

if (!existsSync(openapiSrc)) {
  console.error(`missing OpenAPI contract: ${openapiSrc}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const doc = parseYaml(readFileSync(openapiSrc, "utf8"));
writeFileSync(jsonOut, `${JSON.stringify(doc, null, 2)}\n`);
cpSync(openapiSrc, yamlOut);

console.log(
  JSON.stringify({
    msg: "openapi prepared for vitepress-openapi",
    jsonOut,
    yamlOut,
    paths: Object.keys(doc.paths || {}).length,
  }),
);
