#!/usr/bin/env node
// Keep commit authorship with the people who own the change.
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const ASSISTANT_TRAILER =
  /^Co-authored-by:\s*Cursor\s*<cursoragent@cursor\.com>\s*$/i;
const PRODUCT_NAME = /\bCursor\b/;
const ASSISTANT_EMAIL = /cursoragent@cursor\.com/i;
const SKIPPED_TRACKED_FILES = new Set([
  "pnpm-lock.yaml",
  "scripts/commit-attribution.mjs",
  "scripts/commit-attribution.test.mjs",
]);

export function stripAssistantAttribution(message) {
  const stripped = message
    .split(/\r?\n/)
    .filter((line) => !ASSISTANT_TRAILER.test(line.trim()))
    .join("\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
  if (stripped.length === 0 || stripped.endsWith("\n")) return stripped;
  return `${stripped}\n`;
}

export function commitHasAssistantAttribution(message) {
  return message.split(/\r?\n/).some((line) => ASSISTANT_TRAILER.test(line.trim()));
}

export function textCreditsAssistant(text) {
  return PRODUCT_NAME.test(text) || ASSISTANT_EMAIL.test(text);
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function commitsAfter(base) {
  if (!base || /^0+$/.test(base)) return [];
  const raw = git(["log", "--reverse", "--format=%H%x1e%B%x1e", `${base}..HEAD`]);
  const parts = raw.split("\x1e");
  const commits = [];
  for (let index = 0; index + 1 < parts.length; index += 2) {
    const sha = parts[index].trim();
    if (!sha) continue;
    commits.push({ sha, message: parts[index + 1] });
  }
  return commits;
}

async function trackedCredit() {
  const files = git(["ls-files", "-z"]).split("\0").filter(Boolean);
  const hits = [];
  for (const file of files) {
    if (SKIPPED_TRACKED_FILES.has(file)) continue;
    let text;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    if (text.includes("\0")) continue;
    if (textCreditsAssistant(text)) hits.push(file);
  }
  return hits;
}

async function stripFile(file) {
  const original = await readFile(file, "utf8");
  const stripped = stripAssistantAttribution(original);
  if (stripped !== original) await writeFile(file, stripped);
}

async function main() {
  const [command, value] = process.argv.slice(2);
  if (command === "--strip") {
    if (!value) {
      console.error("usage: commit-attribution.mjs --strip <message-file>");
      process.exit(2);
    }
    await stripFile(value);
    return;
  }

  const failures = [];
  if (command === "--check-range") {
    for (const commit of commitsAfter(value)) {
      if (commitHasAssistantAttribution(commit.message)) {
        failures.push(`${commit.sha} adds a coding-assistant co-author trailer`);
      }
    }
  } else if (command) {
    console.error("usage: commit-attribution.mjs [--strip <file> | --check-range <base-sha>]");
    process.exit(2);
  }

  const files = await trackedCredit();
  for (const file of files) {
    failures.push(`${file} credits a coding assistant`);
  }
  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("commit-attribution.mjs")) {
  await main();
}
