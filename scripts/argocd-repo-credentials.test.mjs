import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  checkRepoCredentialLayout,
  printRepoCredentialSteps,
} from "./argocd-repo-credentials.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("argocd repo credential layout is documented (INT-155)", async () => {
  const summary = await checkRepoCredentialLayout(root);
  assert.equal(summary.secretName, "repo-intelligent-eu-billing-and-payment");
  assert.match(summary.repoUrl, /intelligent-eu-billing-and-payment\.git$/);
  assert.equal(summary.namespace, "argocd");
});

test("printed steps never embed a token value", () => {
  const text = printRepoCredentialSteps();
  assert.match(text, /ARGOCD_GITHUB_TOKEN/);
  assert.match(text, /argocd\.argoproj\.io\/secret-type=repository/);
  assert.match(text, /repo-intelligent-eu-billing-and-payment/);
  assert.equal(text.includes("ghp_"), false);
  assert.equal(text.includes("github_pat_"), false);
  assert.equal(/password=[A-Za-z0-9_]{20,}/.test(text), false);
});

test("bootstrap workflow can install repo credentials from GHA secret", async () => {
  const text = await readFile(
    path.join(root, ".github/workflows/argocd-bootstrap.yml"),
    "utf8",
  );
  assert.match(text, /ARGOCD_GITHUB_TOKEN/);
  assert.match(text, /argocd-repo-credentials\.mjs --apply/);
});
