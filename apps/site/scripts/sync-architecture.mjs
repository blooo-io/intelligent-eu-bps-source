#!/usr/bin/env node
/**
 * INT-413 — publish docs/architecture on the VitePress site at build time.
 * Canonical source stays docs/architecture/; apps/site/architecture/ is generated.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const repoRoot = path.resolve(siteRoot, "../..");
const srcDir = path.join(repoRoot, "docs/architecture");
const outDir = path.join(siteRoot, "architecture");
const publicTopicsDir = path.join(siteRoot, "public/architecture/ewds-topics");

const GITHUB_BLOB =
  "https://github.com/blooo-io/intelligent-eu-bps-source/blob/develop";

const BANNER = [
  "",
  "> **Published from the repository.** Canonical source:",
  "> [`docs/architecture/`](https://github.com/blooo-io/intelligent-eu-bps-source/tree/develop/docs/architecture).",
  "> Edit that tree in a pull request — this page is regenerated for the docs site (INT-413).",
  "",
].join("\n");

/** Map repo-relative architecture filenames to VitePress page links. */
function toSiteHref(target) {
  const clean = target.replace(/^\.\//, "").replace(/\\/g, "/");
  if (clean === "README.md" || clean === "README") return "./";
  if (clean === "ewds-topics/" || clean === "ewds-topics") {
    return "./ewds-topics";
  }
  if (clean.endsWith(".md")) {
    const base = clean.slice(0, -3);
    if (base === "README") return "./";
    return `./${base}`;
  }
  return null;
}

/**
 * Rewrite markdown links so they resolve on the docs site (or GitHub for
 * paths outside docs/architecture).
 */
function rewriteLinks(markdown, fileName) {
  return markdown.replace(/\]\(([^)]+)\)/g, (full, href) => {
    const trimmed = href.trim();
    if (
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.startsWith("mailto:") ||
      trimmed.startsWith("#")
    ) {
      return full;
    }

    // Site-local architecture peer links.
    const siteHref = toSiteHref(trimmed);
    if (siteHref !== null && !trimmed.startsWith("../")) {
      return `](${siteHref})`;
    }

    // Paths outside docs/architecture (e.g. ../release/…) → GitHub blob.
    if (trimmed.startsWith("../")) {
      const resolved = path.posix.normalize(
        path.posix.join("docs/architecture", trimmed),
      );
      return `](${GITHUB_BLOB}/${resolved})`;
    }

    return full;
  });
}

/** Insert the publication banner after YAML frontmatter when present. */
function withBanner(markdown) {
  if (markdown.startsWith("---")) {
    const end = markdown.indexOf("\n---", 3);
    if (end !== -1) {
      const after = end + "\n---".length;
      // Drop the blank line that usually follows frontmatter; BANNER already
      // supplies surrounding newlines.
      const rest = markdown.slice(after).replace(/^\n+/, "");
      return `${markdown.slice(0, after)}\n${BANNER}${rest}`;
    }
  }
  return `${BANNER}\n${markdown}`;
}

function writePage(fileName, body) {
  const outName = fileName === "README.md" ? "index.md" : fileName;
  const rewritten = withBanner(rewriteLinks(body, fileName));
  // Prefer deep outline on long architecture chapters.
  const withOutline = rewritten.startsWith("---")
    ? rewritten.replace(/^---\n/, "---\noutline: deep\neditLink: false\n")
    : `---\noutline: deep\neditLink: false\n---\n${rewritten}`;
  writeFileSync(path.join(outDir, outName), withOutline, "utf8");
}

function syncEwdsTopicsIndex() {
  const topicsSrc = path.join(srcDir, "ewds-topics");
  if (!existsSync(topicsSrc)) return;

  mkdirSync(publicTopicsDir, { recursive: true });
  for (const name of readdirSync(topicsSrc)) {
    const from = path.join(topicsSrc, name);
    cpSync(from, path.join(publicTopicsDir, name));
  }

  // Static copies under public/. Skip README.md: VitePress strips ".md" from
  // links and would treat /architecture/ewds-topics/README as a missing page.
  const files = readdirSync(topicsSrc)
    .filter((f) => f !== "README.md")
    .sort();
  const rows = files
    .map((f) => `| \`${f}\` | [Download](/architecture/ewds-topics/${f}) |`)
    .join("\n");

  const page = `---
title: EWDS topic schemas
outline: deep
editLink: false
---
${BANNER}
# EWDS topic schemas

Draft JSON Schemas and examples used by the data-space publication path (AC-10 / P-DS). They live in \`docs/architecture/ewds-topics/\` in the repository and are copied here for browsing.

| File | Link |
|---|---|
${rows}

Related: [EWDS / DDHub Client Gateway](./ewds-client-gateway).
`;
  writeFileSync(path.join(outDir, "ewds-topics.md"), page, "utf8");
}

function main() {
  if (!existsSync(srcDir)) {
    console.error(`INT-413: missing source ${srcDir}`);
    process.exit(1);
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  for (const name of readdirSync(srcDir)) {
    if (!name.endsWith(".md")) continue;
    const body = readFileSync(path.join(srcDir, name), "utf8");
    writePage(name, body);
  }

  syncEwdsTopicsIndex();
  console.log(`INT-413: synced architecture docs → ${path.relative(repoRoot, outDir)}`);
}

main();
