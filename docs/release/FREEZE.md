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

See [`RELEASE-NOTES.md`](RELEASE-NOTES.md). In-scope UAT: **57 Pass / 5 Blocked / 0 Fail** (INT-193). Blocked rows are not silent gaps; they are listed with external blockers (Connect test charges/payouts, optional pilot perf UAT-040).

## Change control after freeze

1. Do not move `v1.0.0`.
2. Fixes land on `develop` under a new `INT-xxx`, then a new tag (`v1.0.1` / `v1.1.0`) if partners need a refreshed snapshot.
3. `dev` continues on floating `:develop` images (INT-178).

## Remaining partner-report gate (Maylis)

| Issue | Role |
|---|---|
| INT-90 | Integrate build/validation results into the D5.5 narrative |
| INT-91 | Finalise the D5.5 deliverable report |

Until INT-90 / INT-91 close, the **source** package is frozen; the **written D5.5 deliverable report** is not declared frozen.
