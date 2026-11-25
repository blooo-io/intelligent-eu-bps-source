#!/usr/bin/env node
/**
 * Vault → repo spec sync that preserves UAT run evidence (Task 6.6 / INT-437).
 *
 * Spec fields + Given/When/Then come from the vault; RUN_FIELDS stay from the repo
 * unless the case text changed (then status resets to Not Run and a note is appended).
 *
 * Front matter is parsed with a small YAML subset (no js-yaml dependency) so the
 * script stays MIT-clean and works from the repo root without a new package.
 */
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** Front-matter keys that are owned by the repo run campaign, not the vault. */
export const RUN_FIELDS = Object.freeze([
  "status",
  "last_run",
  "tester",
  "run_path",
]);

const SPEC_COMPARE_KEYS = [
  "requirement",
  "given",
  "when",
  "then",
  "scope_d55",
];

/**
 * Minimal YAML scalar / flow-array parser for UAT/REQ front matter.
 * @param {string} fmRaw
 * @returns {Record<string, unknown>}
 */
function parseFrontMatter(fmRaw) {
  /** @type {Record<string, unknown>} */
  const fm = {};
  for (const line of fmRaw.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let raw = line.slice(idx + 1).trim();
    if (raw === "null" || raw === "~") {
      fm[key] = null;
      continue;
    }
    if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) {
      fm[key] = raw.slice(1, -1);
      continue;
    }
    if (raw.startsWith("[") && raw.endsWith("]")) {
      const inner = raw.slice(1, -1).trim();
      fm[key] = inner
        ? inner.split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        : [];
      continue;
    }
    fm[key] = raw;
  }
  return fm;
}

/**
 * @param {string} text
 * @returns {{ fm: Record<string, unknown>; spec: string; runNotes: string[] }}
 */
export function splitNote(text) {
  const triple = text.split(/^---\s*$/m);
  let fmRaw = "";
  let body = text;
  if (triple.length >= 3 && triple[0].trim() === "") {
    fmRaw = triple[1] ?? "";
    body = triple.slice(2).join("---").replace(/^\n/, "");
  }

  const fm = fmRaw.trim() ? parseFrontMatter(fmRaw) : {};
  const runNotes = [];
  const runIdx = body.search(/^## Run notes\s*$/m);
  let spec = body;
  if (runIdx >= 0) {
    spec = body.slice(0, runIdx).trimEnd() + "\n";
    const notesBlock = body.slice(runIdx).split(/\n/).slice(1);
    for (const line of notesBlock) {
      const t = line.trimEnd();
      if (!t.trim()) continue;
      runNotes.push(t.replace(/^\s+/, ""));
    }
  }

  return { fm, spec, runNotes };
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function findConfidentialMarkers(text) {
  const found = new Set();
  for (const m of text.matchAll(/(?<![A-Z])Q-\d{3}\b/g)) {
    found.add(m[0]);
  }
  if (/project-context/.test(text)) found.add("project-context");
  if (/(^|[^a-zA-Z])brain\//.test(text)) found.add("brain/");
  for (const m of text.matchAll(
    /[A-Z0-9._%+-]+@(?!example\.invalid\b)[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  )) {
    found.add(m[0]);
  }
  return [...found];
}

/**
 * @param {unknown} value
 */
function normalizeScalar(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    return value.trim().replace(/^['"]|['"]$/g, "");
  }
  return String(value);
}

/**
 * Always emit requirement as "[[REQ-xxx]]" (double quotes) for nfr-traceability.
 * @param {unknown} value
 */
function normalizeRequirement(value) {
  const raw = normalizeScalar(value);
  const id = raw.replace(/^\[\[|\]\]$/g, "");
  return `[[${id}]]`;
}

/**
 * @param {string} vaultText
 * @param {string | null} repoText
 * @param {string} today
 */
export function mergeUatNote(vaultText, repoText, today) {
  const vault = splitNote(vaultText);
  if (!repoText) {
    const fm = { ...vault.fm };
    fm.status = "Not Run";
    fm.last_run = null;
    fm.tester = null;
    const text = renderNote(fm, vault.spec, vault.runNotes);
    return { text, rerun: true };
  }

  const repo = splitNote(repoText);
  let rerun = false;
  for (const key of SPEC_COMPARE_KEYS) {
    if (normalizeScalar(vault.fm[key]) !== normalizeScalar(repo.fm[key])) {
      rerun = true;
      break;
    }
  }

  /** @type {Record<string, unknown>} */
  const fm = { ...vault.fm };
  if (fm.requirement !== undefined) {
    fm.requirement = normalizeRequirement(fm.requirement);
  }

  if (rerun) {
    fm.status = "Not Run";
    fm.last_run = null;
    fm.tester = null;
    if (repo.fm.run_path !== undefined) fm.run_path = repo.fm.run_path;
  } else {
    for (const key of RUN_FIELDS) {
      if (repo.fm[key] !== undefined) fm[key] = repo.fm[key];
    }
  }

  const notes = mergeNotes(repo.runNotes, vault.runNotes);
  if (rerun) {
    notes.push(
      `- ${today} Spec v6.1 changed this case; earlier results superseded.`,
    );
  }

  return { text: renderNote(fm, vault.spec || repo.spec, notes), rerun };
}

/**
 * @param {string[]} a
 * @param {string[]} b
 */
function mergeNotes(a, b) {
  const out = [];
  const seen = new Set();
  for (const line of [...a, ...b]) {
    const key = line.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(line.startsWith("-") ? line : `- ${line.replace(/^-\s*/, "")}`);
  }
  return out;
}

/**
 * @param {Record<string, unknown>} fm
 * @param {string} spec
 * @param {string[]} runNotes
 */
function renderNote(fm, spec, runNotes) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fm)) {
    if (key === "requirement") {
      lines.push(`requirement: "${normalizeRequirement(value)}"`);
      continue;
    }
    if (key === "status" && typeof value === "string") {
      lines.push(`status: "${value}"`);
      continue;
    }
    if (value === null) {
      lines.push(`${key}: null`);
      continue;
    }
    if (Array.isArray(value)) {
      const inner = value
        .map((v) => (typeof v === "string" ? JSON.stringify(v) : String(v)))
        .join(", ");
      lines.push(`${key}: [${inner}]`);
      continue;
    }
    if (typeof value === "string") {
      if (/[:#{}[\],&*?|>!%@`]/.test(value) || value === "") {
        lines.push(`${key}: ${JSON.stringify(value)}`);
      } else {
        lines.push(`${key}: ${value}`);
      }
      continue;
    }
    lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  lines.push("---");
  let body = (spec || "").replace(/\s+$/, "") + "\n";
  if (runNotes.length > 0) {
    if (!/^## Run notes\s*$/m.test(body)) {
      body += "\n## Run notes\n\n";
    } else {
      body = body.replace(/\n## Run notes[\s\S]*$/, "\n## Run notes\n\n");
    }
    body +=
      runNotes.map((n) => (n.startsWith("-") ? n : `- ${n}`)).join("\n") + "\n";
  }
  return lines.join("\n") + "\n" + body.replace(/^\n+/, "");
}

/**
 * @param {{ from: string; to: string; today: string; dryRun: boolean }} o
 */
export async function syncSpec(o) {
  const copied = [];
  const rerun = [];
  /** @type {{ file: string; markers: string[] }[]} */
  const blocked = [];

  const fromRoot = o.from;
  async function walk(rel = "") {
    const abs = path.join(fromRoot, rel);
    const entries = await readdir(abs, { withFileTypes: true });
    for (const ent of entries) {
      const name = ent.name;
      if (name === ".DS_Store" || name === "traceability-matrix.xlsx") continue;
      const childRel = rel ? path.join(rel, name) : name;
      if (ent.isDirectory()) {
        await walk(childRel);
        continue;
      }
      if (!name.endsWith(".md")) continue;
      const vaultPath = path.join(fromRoot, childRel);
      const vaultText = await readFile(vaultPath, "utf8");
      const markers = findConfidentialMarkers(vaultText);
      if (markers.length > 0) {
        blocked.push({ file: childRel, markers });
        continue;
      }
      const dest = path.join(o.to, childRel);
      if (
        name.startsWith("UAT-") &&
        childRel.includes(`${path.sep}uat${path.sep}`)
      ) {
        let repoText = null;
        try {
          repoText = await readFile(dest, "utf8");
        } catch {
          repoText = null;
        }
        const { text, rerun: did } = mergeUatNote(vaultText, repoText, o.today);
        if (did) rerun.push(childRel);
        if (!o.dryRun) {
          await mkdir(path.dirname(dest), { recursive: true });
          await writeFile(dest, text, "utf8");
        }
        copied.push(childRel);
        continue;
      }
      if (!o.dryRun) {
        await mkdir(path.dirname(dest), { recursive: true });
        await writeFile(dest, vaultText, "utf8");
      }
      copied.push(childRel);
    }
  }

  await walk("");
  return { copied, rerun, blocked };
}

async function main(argv) {
  const fromIdx = argv.indexOf("--from");
  if (fromIdx < 0 || !argv[fromIdx + 1]) {
    console.error(
      "usage: node scripts/sync-spec.mjs --from <vault> [--dry-run]",
    );
    process.exit(1);
  }
  const from = argv[fromIdx + 1];
  const dryRun = argv.includes("--dry-run");
  const to = path.join(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
    "docs/requirements",
  );
  const today = new Date().toISOString().slice(0, 10);
  await stat(from);
  const result = await syncSpec({ from, to, today, dryRun });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (result.blocked.length > 0) process.exit(2);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
