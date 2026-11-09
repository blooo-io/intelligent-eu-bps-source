# V1 source-code release (INT-92)

**Published tag:** `v1.0.1` (INT-359)  
**Package version:** `1.0.1` (root `package.json`)  
**Intended freeze name:** `v1.0.0` (INT-92, 2026-10-18) — recorded in this note, **never pushed**

> **Ongoing release train:** SemVer tags, `scripts/cut-release.mjs`, and the `release` GitHub Actions workflow are documented in [`VERSIONING.md`](VERSIONING.md) (INT-305). This page records the historical V1 freeze tag only.

## What the tag means

Immutable pointer to the D5.5 Billing & Payment Service V1 source tree used for partner review and for `demo` image promotion (see [`deployment.md`](deployment.md)). Floating `:develop` tags on GHCR remain the `dev` path (INT-178); `demo` consumes a release tag.

## Contents of the release

| Area | Location |
|---|---|
| Specification | `docs/requirements/` |
| Architecture | `docs/architecture/` |
| Contracts | `contracts/` |
| Services / web / mocks | `services/`, `apps/web/`, `mocks/` |
| Deploy packaging | `deploy/` |
| Operator release docs | `docs/release/` |
| Validation evidence | `docs/testing/` (INT-73…INT-81) |

## How the tag was created

INT-92 (2026-10-18) recorded `v1.0.0` as the freeze tag and set the package version to `1.0.0`. That annotated tag was never pushed. The tree then moved (INT-305 release train, then the D5.5 review corrections INT-351…INT-362). Tags are immutable, so `v1.0.0` is not created on a later commit.

`v1.0.1` is the first tag actually published. It is cut from `develop` after this note merges, with [`VERSIONING.md`](VERSIONING.md) / `node scripts/cut-release.mjs --push` (INT-359). `demo` Argo applications pin `targetRevision: v1.0.1`.

Do not retag. A later fix is a new `v1.0.x` / `v1.1.0` under a new Jira issue.

## Consistency prerequisites (INT-96)

Before internal approval, confirm:

1. Root `package.json` `version` equals the git tag without the `v` prefix.
2. [`RELEASE-NOTES.md`](RELEASE-NOTES.md) known limitations match in-scope UAT statuses (Pass / Blocked / Fail).
3. [`../testing/v1-validation-summary.md`](../testing/v1-validation-summary.md) and the INT-81 snapshot in [`../requirements/traceability-dashboard.md`](../requirements/traceability-dashboard.md) agree on counts.
4. INT-93 / INT-94 / INT-95 docs are present and linked from [`README.md`](README.md).

Maylis-owned INT-90 (integrate build/validation into D5.5 narrative) remains a separate gate for the partner-facing D5.5 report; it does not block creating the source tag.
