# V1 source-code release (INT-92)

**Tag:** `v1.0.0`  
**Branch tip:** `develop` at the merge that lands this note  
**Package version:** `1.0.0` (root `package.json`)

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

`v1.0.0` was cut as an annotated tag on 2026-10-18 (INT-92). Later versions use [`VERSIONING.md`](VERSIONING.md) / `node scripts/cut-release.mjs --push`.

Do not retag. A fix after freeze is a new `v1.0.x` / `v1.1.0` under a new Jira issue.

## Consistency prerequisites (INT-96)

Before internal approval, confirm:

1. Root `package.json` `version` equals the git tag without the `v` prefix.
2. [`RELEASE-NOTES.md`](RELEASE-NOTES.md) known limitations match in-scope UAT statuses (Pass / Blocked / Fail).
3. [`../testing/v1-validation-summary.md`](../testing/v1-validation-summary.md) and the INT-81 snapshot in [`../requirements/traceability-dashboard.md`](../requirements/traceability-dashboard.md) agree on counts.
4. INT-93 / INT-94 / INT-95 docs are present and linked from [`README.md`](README.md).

Maylis-owned INT-90 (integrate build/validation into D5.5 narrative) remains a separate gate for the partner-facing D5.5 report; it does not block creating the source tag.
