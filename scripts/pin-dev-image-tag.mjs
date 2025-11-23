#!/usr/bin/env node
/**
 * INT-177 — pin deploy/envs/dev/values.yaml image.tag to a commit SHA.
 * Used after supply-chain pushes GHCR images so Argo syncs the new tag.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VALUES = path.join(root, "deploy/envs/dev/values.yaml");

export function pinImageTag(yamlText, sha) {
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
    throw new Error(`invalid sha: ${sha}`);
  }
  if (!/^image:\n(?:.*\n)*?\s*tag:\s*".*"/m.test(yamlText) && !/tag:\s*".*"/.test(yamlText)) {
    throw new Error("deploy/envs/dev/values.yaml missing image.tag");
  }
  return yamlText.replace(
    /(^image:\n(?:[ \t]+.*\n)*?[ \t]+tag:\s*")[^"]*(")/m,
    `$1${sha}$2`,
  );
}

export async function pinDevImageTag(sha, valuesPath = VALUES) {
  const before = await readFile(valuesPath, "utf8");
  const after = pinImageTag(before, sha);
  if (before === after) {
    return { changed: false, sha };
  }
  await writeFile(valuesPath, after);
  return { changed: true, sha };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sha = process.argv[2] || process.env.GITHUB_SHA;
  if (!sha) {
    console.error("usage: node scripts/pin-dev-image-tag.mjs <sha>");
    process.exit(1);
  }
  const result = await pinDevImageTag(sha);
  console.log(JSON.stringify(result));
}
