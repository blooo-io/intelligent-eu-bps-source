#!/usr/bin/env node
// A10.7 — guard tracked public text against personal identifiers and brain question ids.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { operatorEnv } from "./lib/operator-env.mjs";

/** @typedef {"jira-account-id" | "personal-blooo-email" | "brain-question-id"} HygieneRule */

const HYGIENE_TEXT_EXTENSIONS = new Set([
  ".md",
  ".mdc",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);
const SKIPPED_TRACKED_FILES = new Set(["pnpm-lock.yaml"]);

const LOWER_HEX_RUN = /[0-9a-f]+/gi;
const JIRA_ATLASSIAN_PREFIX =
  /712020:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const PERSONAL_BLOOO_EMAIL = /[a-z][a-z0-9.]*@blooo\.io/gi;
const BRAIN_QUESTION_ID = /(?<![A-Z])Q-\d{3}\b/g;

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", env: operatorEnv() });
}

function extensionOf(filePath) {
  return path.extname(filePath).toLowerCase();
}

function scansHygieneText(filePath) {
  return HYGIENE_TEXT_EXTENSIONS.has(extensionOf(filePath));
}

function scansBrainQuestionIds(filePath) {
  // INT-440 / A10.7 — every docs/ path is public; no superpowers exemption.
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.startsWith("docs/");
}

/**
 * @param {{ path: string; text: string }[]} files
 * @returns {{ path: string; line: number; rule: HygieneRule }[]}
 */
export function findHygieneViolations(files) {
  /** @type {{ path: string; line: number; rule: HygieneRule }[]} */
  const violations = [];

  for (const file of files) {
    const lines = file.text.split(/\r?\n/);
    const checkJira = scansHygieneText(file.path);
    const checkBrain = scansBrainQuestionIds(file.path);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const lineNo = index + 1;

      if (checkJira) {
        let jiraHit = false;
        for (const match of line.matchAll(LOWER_HEX_RUN)) {
          if (match[0].length === 24) {
            jiraHit = true;
            break;
          }
        }
        if (!jiraHit) {
          for (const match of line.matchAll(JIRA_ATLASSIAN_PREFIX)) {
            if (match[0]) {
              jiraHit = true;
              break;
            }
          }
        }
        if (jiraHit) {
          violations.push({
            path: file.path,
            line: lineNo,
            rule: "jira-account-id",
          });
        }

        for (const match of line.matchAll(PERSONAL_BLOOO_EMAIL)) {
          if (match[0].toLowerCase() === "security@blooo.io") continue;
          violations.push({
            path: file.path,
            line: lineNo,
            rule: "personal-blooo-email",
          });
          break;
        }
      }

      if (checkBrain) {
        for (const match of line.matchAll(BRAIN_QUESTION_ID)) {
          if (match[0]) {
            violations.push({
              path: file.path,
              line: lineNo,
              rule: "brain-question-id",
            });
            break;
          }
        }
      }
    }
  }

  return violations;
}

/**
 * @param {string} root
 * @returns {Promise<string[]>}
 */
export async function listTrackedTextFiles(root) {
  const cwd = path.resolve(root);
  const raw = git(["-C", cwd, "ls-files", "-z"]);
  return raw
    .split("\0")
    .filter(Boolean)
    .filter((file) => !SKIPPED_TRACKED_FILES.has(file))
  // Binary-ish paths are still listed; readers skip files that are not UTF-8 text.
}