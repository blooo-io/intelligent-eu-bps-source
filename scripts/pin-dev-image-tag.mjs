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

/**
 * Replace `image.tag` without nested `.*` quantifiers (javascript:S5852).
 */
export function pinImageTag(yamlText, sha) {
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
    throw new Error(`invalid sha: ${sha}`);
  }
  const lines = yamlText.split("\n");
  let inImage = false;
  let replaced = false;
  const out = lines.map((line) => {
    if (/^image:\s*$/.test(line)) {
      inImage = true;
      return line;
    }
    if (inImage && line.length > 0 && !/^[ \t]/.test(line)) {
      inImage = false;
    }
    if (inImage) {
      const match = /^([ \t]+tag:\s*")([^"]*)(")\s*$/.exec(line);
      if (match) {
        replaced = true;
        return `${match[1]}${sha}${match[3]}`;
      }
    }
    return line;
  });
  if (!replaced) {
    throw new Error("deploy/envs/dev/values.yaml missing image.tag");
  }
  return out.join("\n");
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
