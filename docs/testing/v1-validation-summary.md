# V1 validation summary (INT-81)

Traceability / validation snapshot for D5.5. Source of truth remains the UAT item notes and [`traceability-dashboard.md`](../requirements/traceability-dashboard.md).

**As of 2026-11-25 (Europe/Paris), tag v1.2.0 (INT-437 / Task 6.14):** **63** in-scope UATs — **63 Pass** (incl. Pass on mock path), **0 Blocked**, **0 Not Run**, **0 Fail**.

Counts are computed from UAT front matter (see [`v6.1-rerun.md`](v6.1-rerun.md)). Mock-path results use `run_path: mock` or `status: Pass on mock path`. Live CGW cases that were not re-run stay labelled mock-path.

## Evidence index

## Evidence index

| Layer | Document / artefact |
|---|---|
| Unit / component (≥80%) | [`v1-unit-component-evidence.md`](v1-unit-component-evidence.md) (INT-73) |
| Integration S1–S13 | [`v1-integration-execution.md`](v1-integration-execution.md) (INT-75); defect D-INT-75-01 fixed INT-82 |
| Functional / system | [`v1-functional-execution.md`](v1-functional-execution.md) (INT-78 / INT-80) |
| Confirmed case set | [`v1-functional-cases.md`](v1-functional-cases.md) (INT-76) |
| Partner UAT package | [`v1-uat-package.md`](v1-uat-package.md) (INT-79 / INT-80) |
| v6.1 re-run packaging | [`v6.1-rerun.md`](v6.1-rerun.md) (INT-430 / Task 6.14) |
| Release notes / limits | [`../release/RELEASE-NOTES.md`](../release/RELEASE-NOTES.md) (INT-95) |
| NFR-010 guard | `scripts/nfr-traceability.test.mjs` |
| Stripe adapters | INT-189 (`StripePspAdapter` / `StripeInvoiceAdapter`, `PSP_PROVIDER=stripe` on `dev`) |

## Status by UAT

Path wording: where the UAT note carries `run_path: mock` or `status: Pass on mock path`, the Path column says **mock path**. Prefer the note front matter over this table when they diverge.

| UAT | Requirement | Status | Path |
|---|---|---|---|
| UAT-001 | REQ-001 | Pass | mock path |
| UAT-002 | REQ-002 | Pass | mock path |
| UAT-003 | REQ-003 | Pass | mock path |
| UAT-005 | REQ-005 | Pass | stripe-test |
| UAT-006 | REQ-006 | Pass | stripe-test |
| UAT-007 | REQ-007 | Pass | mock path |
| UAT-008 | REQ-008 | Pass on mock path | mock path |
| UAT-009 | REQ-009 | Pass | stripe-test |
| UAT-010 | REQ-010 | Pass | stripe-test |
| UAT-011 | REQ-011 | Pass | stripe-test |
| UAT-012 | REQ-012 | Pass | stripe-test |
| UAT-013 | REQ-013 | Pass on mock path | mock path |
| UAT-014 | REQ-014 | Pass | stripe-test |
| UAT-015 | REQ-015 | Pass | stripe-test |
| UAT-016 | REQ-016 | Pass | stripe-test |
| UAT-017 | REQ-017 | Pass | stripe-test |
| UAT-018 | REQ-018 | Pass | stripe-test |
| UAT-028 | REQ-028 | Pass | stripe-test |
| UAT-029 | REQ-029 | Pass | mock path |
| UAT-030 | REQ-030 | Pass | stripe-test |
| UAT-031 | REQ-031 | Pass | stripe-test |
| UAT-032 | REQ-032 | Pass | stripe-test |
| UAT-033 | NFR-001 | Pass | mock path |
| UAT-034 | NFR-002 | Pass | mock path |
| UAT-035 | NFR-003 | Pass | mock path |
| UAT-036 | NFR-004 | Pass | mock path |
| UAT-037 | NFR-005 | Pass | mock path |
| UAT-038 | NFR-006 | Pass | mock path |
| UAT-039 | NFR-007 | Pass | mock path |
| UAT-040 | NFR-008 | Pass | mock path |
| UAT-041 | NFR-009 | Pass | mock path |
| UAT-042 | NFR-010 | Pass | mock path |
| UAT-043 | REQ-033 | Pass | stripe-test |
| UAT-044 | REQ-034 | Out of scope (INT-192) |  |
| UAT-045 | REQ-035 | Pass | stripe-test |
| UAT-046 | REQ-036 | Pass | stripe-test |
| UAT-047 | REQ-037 | Out of scope (INT-192) |  |
| UAT-049 | NFR-011 | Pass | stripe-test |
| UAT-050 | REQ-039 | Pass | mock path |
| UAT-051 | REQ-040 | Pass | stripe-test |
| UAT-052 | REQ-041 | Pass | mock path |
| UAT-053 | REQ-042 | Pass | mock path |
| UAT-054 | REQ-043 | Pass | stripe-test |
| UAT-055 | REQ-044 | Pass | stripe-test |
| UAT-056 | REQ-045 | Pass | stripe-test |
| UAT-057 | REQ-046 | Pass | stripe-test |
| UAT-058 | REQ-047 | Pass | stripe-test |
| UAT-059 | NFR-012 | Pass | mock path |
| UAT-060 | REQ-049 | Pass | stripe-test |
| UAT-061 | NFR-013 | Pass | mock path |
| UAT-062 | REQ-050 | Pass | stripe-test |
| UAT-063 | REQ-051 | Pass | stripe-test |
| UAT-064 | REQ-052 | Pass | mock path |
| UAT-065 | NFR-014 | Pass | stripe-test |
| UAT-066 | NFR-015 | Pass | stripe-test |
| UAT-067 | NFR-016 | Pass | stripe-test |
| UAT-068 | NFR-017 | Pass | mock path |
| UAT-069 | REQ-053 | Pass | mock path |
| UAT-070 | REQ-048 | Pass | mock path |
| UAT-071 | REQ-054 | Pass | stripe-test |
| UAT-072 | REQ-055 | Pass | stripe-test |
| UAT-073 | REQ-056 | Pass | stripe-test |
| UAT-074 | REQ-057 | Pass | stripe-test |
| UAT-075 | REQ-058 | Pass | stripe-test |
| UAT-078 | REQ-061 | Pass | mock path |

## Open blockers

None for in-scope V1 UATs (recomputed 2026-11-25). Pilot SLA number (NFR-008) and onboarding step-count (NFR-016) remain deferred optimisations with partners.

## INT-81 / INT-204 note

Validation summary refreshed after INT-204 (UAT-040 Pass). No Fail rows at freeze. Historical in-scope tally: **62 Pass / 0 Blocked / 0 Fail**. For the v6.1 / `v1.2.0` cut, use the computed counts in the release notes and [`v6.1-rerun.md`](v6.1-rerun.md).
