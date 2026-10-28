#!/usr/bin/env node
/**
 * INT-333 — printable PDF for the demo tester workbook (A4).
 * No extra runtime dependency: small Markdown subset → HTML → Playwright PDF.
 *
 * Usage:
 *   node scripts/export-cahier-pdf.mjs
 */
import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { chromium } = require("@playwright/test");

const mdPath = path.join(
  root,
  "docs/testing/cahier-de-tests-demo-intelligent-billing-and-payment.md",
);
const pdfPath = path.join(
  root,
  "docs/testing/cahier-de-tests-demo-intelligent-billing-and-payment.pdf",
);
const testingDir = path.join(root, "docs/testing");

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function inline(s) {
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>',
  );
  return out;
}

/**
 * GFM table separator (`|---|---|`). Keep `-` at the start of the class so it is
 * literal — `[\s:-|]` treats `:-|` as a range and drops `-` (INT-333).
 */
export const TABLE_SEP = /^\|[\-|:\s]+\|$/;

/** Minimal MD → HTML for the cahier (headings, tables, images, lists, quotes). */
export function mdToHtml(md) {
  const lines = md.replaceAll("\r\n", "\n").split("\n");
  const html = [];
  let i = 0;
  let inUl = false;
  let inOl = false;
  const closeLists = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      closeLists();
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        if (!TABLE_SEP.test(lines[i])) rows.push(lines[i]);
        i += 1;
      }
      html.push("<table>");
      rows.forEach((row, idx) => {
        const cells = row
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());
        const tag = idx === 0 ? "th" : "td";
        html.push(
          `<tr>${cells.map((c) => `<${tag}>${inline(c)}</${tag}>`).join("")}</tr>`,
        );
      });
      html.push("</table>");
      continue;
    }

    const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img) {
      closeLists();
      html.push(`<p><img alt="${escapeHtml(img[1])}" src="${escapeHtml(img[2])}" /></p>`);
      i += 1;
      continue;
    }

    if (line.startsWith("> ")) {
      closeLists();
      const quote = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quote.push(lines[i].slice(2));
        i += 1;
      }
      html.push(`<blockquote><p>${inline(quote.join(" "))}</p></blockquote>`);
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      closeLists();
      html.push("<hr />");
      i += 1;
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      closeLists();
      const level = h[1].length;
      html.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      if (!inUl) {
        closeLists();
        html.push("<ul>");
        inUl = true;
      }
      html.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
      i += 1;
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      if (!inOl) {
        closeLists();
        html.push("<ol>");
        inOl = true;
      }
      html.push(`<li>${inline(line.replace(/^\d+\.\s+/, ""))}</li>`);
      i += 1;
      continue;
    }

    if (line.trim() === "") {
      closeLists();
      i += 1;
      continue;
    }

    closeLists();
    html.push(`<p>${inline(line)}</p>`);
    i += 1;
  }
  closeLists();
  return html.join("\n");
}

export async function exportCahierPdf() {
  const md = await readFile(mdPath, "utf8");
  const body = mdToHtml(md);
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Cahier de tests — Intelligent Billing & Payment</title>
  <base href="file://${testingDir}/" />
  <style>
    @page { size: A4; margin: 14mm 12mm; }
    body {
      font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.4;
      color: #0a0f0d;
    }
    h1 { font-size: 20pt; margin: 0 0 8pt; }
    h2 { font-size: 14pt; margin: 18pt 0 8pt; page-break-after: avoid; }
    h3 { font-size: 12pt; margin: 14pt 0 6pt; page-break-after: avoid; }
    table { border-collapse: collapse; width: 100%; margin: 8pt 0 12pt; font-size: 9.5pt; }
    th, td { border: 1px solid #d5ddd6; padding: 4pt 6pt; vertical-align: top; }
    th { background: #f3f6f2; text-align: left; }
    img {
      max-width: 100%;
      height: auto;
      border: 1px solid #d5ddd6;
      margin: 6pt 0 12pt;
      page-break-inside: avoid;
    }
    blockquote {
      margin: 8pt 0;
      padding: 6pt 10pt;
      background: #f3f6f2;
      border-left: 3px solid #c8f542;
    }
    code { font-size: 0.9em; }
    hr { border: none; border-top: 1px solid #d5ddd6; margin: 16pt 0; }
  </style>
</head>
<body>${body}</body>
</html>`;

  const tmpHtml = path.join(testingDir, ".cahier-export.html");
  await writeFile(tmpHtml, html, "utf8");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`file://${tmpHtml}`, {
    waitUntil: "networkidle",
    timeout: 120_000,
  });
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" },
  });
  await browser.close();
  await unlink(tmpHtml).catch(() => {});
  return { ok: true, pdfPath };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  console.log(JSON.stringify(await exportCahierPdf(), null, 2));
}
