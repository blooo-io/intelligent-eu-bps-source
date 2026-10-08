# Versioning and git releases (INT-305)

This repository uses **Semantic Versioning** and **annotated git tags** as the public release train. Floating `:develop` images remain the continuous `dev` path (INT-178); adopters and the upstream `demo` environment consume **immutable release tags**.

## Tag format

| Rule | Value |
|---|---|
| Pattern | `vMAJOR.MINOR.PATCH` (optional pre-release: `vMAJOR.MINOR.PATCH-rc.N`) |
| Example | `v1.0.0`, `v1.0.1`, `v1.1.0` |
| Package version | Root `package.json` `version` equals the tag **without** the leading `v` |
| Mutability | Tags are **immutable**. Never move or retag. Ship a new version instead. |

Pre-release tags (`-rc.N`, `-beta.N`) create GitHub pre-releases; they are not production/`demo` pins unless an operator explicitly chooses them.

## When to bump

| Bump | Use when |
|---|---|
| **PATCH** (`1.0.x`) | Bug fixes, docs/ops that do not change public contracts, non-breaking dependency patches |
| **MINOR** (`1.x.0`) | New backwards-compatible APIs, features, or deploy packaging |
| **MAJOR** (`x.0.0`) | Breaking OpenAPI/AsyncAPI or behaviour that adopters must change for |

Contract-first still applies: a breaking contract change is a **MAJOR** (or a new contract version path), not a silent drift.

## Release train (maintainers)

1. Land the change on `develop` with CI green (and `e2e-dev` green when behaviour is user-facing).
2. Open a small PR that sets root `package.json` `version` to the next SemVer and updates [`RELEASE-NOTES.md`](RELEASE-NOTES.md) (and freeze/consistency notes if the partner package changes).
3. After that PR merges, cut the tag from the tip of `develop`:

   ```bash
   git fetch origin develop
   git checkout develop && git pull origin develop
   node scripts/cut-release.mjs --dry-run          # verify
   node scripts/cut-release.mjs --push             # annotated tag + push
   ```

4. Workflow **`release`** (`.github/workflows/release.yml`) runs on the tag push:
   - Publishes a **GitHub Release** (notes from commits since the previous tag + pointer to `docs/release/`).
   - Builds and pushes module images to GHCR as `:<git-sha>` and `:vX.Y.Z` (full rebuild; not selective).
5. Point `demo` (or your own env) at the git tag / image tag and sync Argo manually ([`deployment.md`](deployment.md)).

To publish a GitHub Release for an **existing** tag (backfill), use workflow_dispatch on `release` with input `tag` (e.g. `v1.0.0`). Images are rebuilt only when the workflow runs on a real `push` of that tag (or when you re-push is forbidden — use a new patch tag instead).

## Adopters

You do not need Blooo’s Jira or cluster. Clone a release tag:

```bash
git clone --branch v1.0.0 https://github.com/blooo-io/intelligent-eu-billing-and-payment.git
```

Or pin container images to `ghcr.io/blooo-io/intelligent-eu-billing-and-payment-<module>:v1.0.0` once that tag’s `release` workflow has completed.

## Related

| Doc | Role |
|---|---|
| [SOURCE-RELEASE.md](SOURCE-RELEASE.md) | Historical V1 tag `v1.0.0` (INT-92) |
| [FREEZE.md](FREEZE.md) | Partner freeze rules for D5.5 |
| [RELEASE-NOTES.md](RELEASE-NOTES.md) | Narrative what ships / limitations |
| [deployment.md](deployment.md) | `dev` vs `demo` refs |
