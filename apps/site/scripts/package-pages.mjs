#!/usr/bin/env node
/**
 * INT-401 — Prepare the VitePress dist for GitHub Pages + custom domain.
 *
 * Blooo canonical host is a dedicated subdomain at the site root:
 *   https://intelligent.docs.blooo.dev/   (DOCS_BASE=/)
 *
 * Custom domains mount the Pages artifact at `/`. With DOCS_BASE=/ the
 * VitePress output already matches that layout — we only copy it and
 * optionally write a root `CNAME`.
 *
 * If DOCS_BASE is a non-root path (adopter / legacy), nest the build under
 * that prefix and add a root redirect so HTML asset URLs resolve.
 *
 * Output: apps/site/.vitepress/pages-dist/
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const distDir = path.join(siteRoot, ".vitepress", "dist");
const outDir = path.join(siteRoot, ".vitepress", "pages-dist");

/** Strip slashes → folder name under the Pages artifact root ("" = root). */
export function pathPrefixFromBase(docsBase) {
  const raw = (docsBase ?? "/").trim() || "/";
  return raw.replace(/^\/+|\/+$/g, "");
}

/**
 * Build the Pages artifact directory.
 * @param {{ docsBase?: string, customDomain?: string, distDir?: string, outDir?: string }} [opts]
 */
export function packagePages(opts = {}) {
  const source = opts.distDir ?? distDir;
  const dest = opts.outDir ?? outDir;
  const docsBase = opts.docsBase ?? process.env.DOCS_BASE ?? "/";
  const customDomain = (
    opts.customDomain ??
    process.env.DOCS_CUSTOM_DOMAIN ??
    ""
  ).trim();
  const prefix = pathPrefixFromBase(docsBase);

  if (!existsSync(source)) {
    throw new Error(`VitePress dist missing at ${source}; run build first`);
  }

  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });

  if (!prefix) {
    // Dedicated subdomain (intelligent.docs.blooo.dev): serve at domain root.
    cpSync(source, dest, { recursive: true });
  } else {
    // Path-prefixed hosting: nest so /<prefix>/assets matches DOCS_BASE.
    const nested = path.join(dest, prefix);
    mkdirSync(path.dirname(nested), { recursive: true });
    cpSync(source, nested, { recursive: true });

    const href = `/${prefix}/`;
    writeFileSync(
      path.join(dest, "index.html"),
      `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0;url=${href}" />
    <link rel="canonical" href="${href}" />
    <title>Redirecting…</title>
    <script>location.replace(${JSON.stringify(href)})</script>
  </head>
  <body>
    <p><a href="${href}">Continue to the documentation</a>.</p>
  </body>
</html>
`,
    );
  }

  // GitHub Pages custom-domain marker at the artifact root.
  if (customDomain) {
    writeFileSync(path.join(dest, "CNAME"), `${customDomain}\n`);
  }

  return { outDir: dest, prefix, customDomain: customDomain || null };
}

// CLI entry (skipped when imported by tests).
const isMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const result = packagePages();
  const where = result.prefix ? `prefix=/${result.prefix}/` : "prefix=/";
  console.log(
    `Packaged Pages artifact → ${result.outDir} (${where}` +
      (result.customDomain ? `, CNAME=${result.customDomain}` : "") +
      ")",
  );
}
