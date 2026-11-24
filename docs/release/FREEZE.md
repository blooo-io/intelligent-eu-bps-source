# D5.5 freeze for partner review (INT-97)

**Freeze date (source):** 2026-10-18  
**Source tag:** `v1.0.0`  
**Delivery gate:** partner review package (calendar gate 10 Nov 2026 for the full D5.5 report)

## Frozen artefacts (Blooo-owned)

| Artefact | Ref |
|---|---|
| Source tree | git tag `v1.0.0` |
| Package version | `1.0.0` |
| Operator docs | `docs/release/` (INT-92…INT-96) |
| Spec / architecture | `docs/requirements/`, `docs/architecture/` |
| Contracts | `contracts/` |
| Validation evidence | `docs/testing/` + UAT notes |

## Carried known limitations

See [`RELEASE-NOTES.md`](RELEASE-NOTES.md) for the current v6.1 / `v1.2.0` limitations (two-level model, monthly period, live per community, remaining Connect / OpenAPI / report gaps).

The INT-97 source freeze on 2026-10-18 carried in-scope UAT **62 Pass / 0 Blocked / 0 Fail** (INT-204). The v6.1 re-run campaign (INT-430) refreshes those counts in the release notes and in [`../testing/v6.1-rerun.md`](../testing/v6.1-rerun.md); partner optimisations (NFR-008 SLA number, NFR-016 step-count) remain deferred, not Blocked.

## Change control after freeze

1. Do not create or move `v1.0.0`. It was named on 2026-10-18 and never pushed; creating it now would point at a different tree.
2. The first published snapshot is `v1.0.1` (INT-359), cut with [`VERSIONING.md`](VERSIONING.md) / `cut-release.mjs` (INT-305). Later fixes are a new tag.
3. `dev` continues on floating `:develop` images (INT-178). `demo` pins the published tag.
4. The v6.1 realignment (INT-423…INT-432) lands on `develop` under SemVer; the upcoming published tag is `v1.2.0` (package version `1.2.0`, INT-430). The annotated tag is cut by `stable-release` / `cut-release.mjs` after merge — not claimed here.

## Remaining partner-report gate (Blooo D5.5 report owner)

| Issue | Role |
|---|---|
| INT-90 | Integrate build/validation results into the D5.5 narrative |
| INT-91 | Finalise the D5.5 deliverable report |

Until INT-90 / INT-91 close, the **source** package is frozen; the **written D5.5 deliverable report** is not declared frozen.
