#!/usr/bin/env node
/**
 * INT-401 — Nest the VitePress dist so GitHub Pages + custom domain
 * serves assets under the same path prefix as DOCS_BASE.
 *
 * Project Pages without a custom domain already mount the artifact at
 * /<repo>/. With a custom domain (docs.blooo.dev), Pages mounts the
 * artifact at the domain root — so a build with
 * DOCS_BASE=/intelligent-eu-bps-source/ must ship files under that
 * folder inside the artifact, or CSS/JS 404.
 *
 * Output layout (default):
 *   .vitepress/pages-dist/
 *     CNAME                          ← custom domain (optional)
 *     index.html                     ← redirect to DOCS_BASE
 *     intelligent-eu-bps-source/     ← VitePress build
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

/** Strip slashes → folder name under the Pages artifact root. */
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
  if (!prefix) {
    throw new Error(
      "DOCS_BASE must be a non-root path (e.g. /intelligent-eu-bps-source/) when packaging for docs.blooo.dev",
    );
  }

  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });

  // Nest the whole VitePress output under the path prefix.
  const nested = path.join(dest, prefix);
  mkdirSync(path.dirname(nested), { recursive: true });
  cpSync(source, nested, { recursive: true });

  // Root bounce so https://docs.blooo.dev/ lands on the docs prefix.
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

  // GitHub Pages custom-domain marker at the artifact root (not under prefix).
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
  console.log(
    `Packaged Pages artifact → ${result.outDir} (prefix=/${result.prefix}/` +
      (result.customDomain ? `, CNAME=${result.customDomain}` : "") +
      ")",
  );
}
