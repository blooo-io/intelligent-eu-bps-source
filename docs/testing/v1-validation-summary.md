# V1 validation summary (INT-81)

Interim traceability / validation snapshot for D5.5. Source of truth remains the UAT item notes and [`traceability-dashboard.md`](../requirements/traceability-dashboard.md). Refresh after remaining INT-80 partner / Stripe cases.

**As of 2026-10-17** (`develop` + INT-80 batch): **64** in-scope UATs — **53 Pass**, **11 Not Run**, **0 Fail**, **0 Blocked**.

## Evidence index

| Layer | Document / artefact |
|---|---|
| Unit / component (≥80%) | [`v1-unit-component-evidence.md`](v1-unit-component-evidence.md) (INT-73) |
| Integration S1–S13 | [`v1-integration-execution.md`](v1-integration-execution.md) (INT-75); defect D-INT-75-01 fixed INT-82 |
| Functional / system | [`v1-functional-execution.md`](v1-functional-execution.md) (INT-78); verification INT-77 |
| Confirmed case set | [`v1-functional-cases.md`](v1-functional-cases.md) (INT-76) |
| Partner UAT package | [`v1-uat-package.md`](v1-uat-package.md) (INT-79) |
| Release notes / limits | [`../release/RELEASE-NOTES.md`](../release/RELEASE-NOTES.md) (INT-95) |
| NFR-010 guard | `scripts/nfr-traceability.test.mjs` |

## Status by UAT

| UAT | Requirement | Status |
|---|---|---|
| UAT-001 | REQ-001 | Pass |
| UAT-002 | REQ-002 | Pass |
| UAT-003 | REQ-003 | Pass |
| UAT-005 | REQ-005 | Pass |
| UAT-006 | REQ-006 | Pass |
| UAT-007 | REQ-007 | Pass |
| UAT-008 | REQ-008 | Pass |
| UAT-009 | REQ-009 | Pass |
| UAT-010 | REQ-010 | Pass |
| UAT-011 | REQ-011 | Pass |
| UAT-012 | REQ-012 | Pass |
| UAT-013 | REQ-013 | Pass |
| UAT-014 | REQ-014 | Pass |
| UAT-015 | REQ-015 | Not Run |
| UAT-016 | REQ-016 | Pass |
| UAT-017 | REQ-017 | Pass |
| UAT-018 | REQ-018 | Pass |
| UAT-028 | REQ-028 | Not Run |
| UAT-029 | REQ-029 | Pass |
| UAT-030 | REQ-030 | Pass |
| UAT-031 | REQ-031 | Pass |
| UAT-032 | REQ-032 | Pass |
| UAT-033 | NFR-001 | Pass |
| UAT-034 | NFR-002 | Pass |
| UAT-035 | NFR-003 | Pass |
| UAT-036 | NFR-004 | Pass |
| UAT-037 | NFR-005 | Pass |
| UAT-038 | NFR-006 | Pass |
| UAT-039 | NFR-007 | Pass |
| UAT-040 | NFR-008 | Not Run |
| UAT-041 | NFR-009 | Pass |
| UAT-042 | NFR-010 | Pass |
| UAT-043 | REQ-033 | Pass |
| UAT-044 | REQ-034 | Not Run |
| UAT-045 | REQ-035 | Pass |
| UAT-046 | REQ-036 | Pass |
| UAT-047 | REQ-037 | Not Run |
| UAT-049 | NFR-011 | Pass |
| UAT-050 | REQ-039 | Not Run |
| UAT-051 | REQ-040 | Not Run |
| UAT-052 | REQ-041 | Pass |
| UAT-053 | REQ-042 | Not Run |
| UAT-054 | REQ-043 | Pass |
| UAT-055 | REQ-044 | Pass |
| UAT-056 | REQ-045 | Pass |
| UAT-057 | REQ-046 | Pass |
| UAT-058 | REQ-047 | Pass |
| UAT-059 | NFR-012 | Pass |
| UAT-060 | REQ-049 | Pass |
| UAT-061 | NFR-013 | Not Run |
| UAT-062 | REQ-050 | Pass |
| UAT-063 | REQ-051 | Pass |
| UAT-064 | REQ-052 | Not Run |
| UAT-065 | NFR-014 | Pass |
| UAT-066 | NFR-015 | Pass |
| UAT-067 | NFR-016 | Not Run |
| UAT-068 | NFR-017 | Pass |
| UAT-069 | REQ-053 | Pass |
| UAT-070 | REQ-048 | Pass |
| UAT-071 | REQ-054 | Pass |
| UAT-072 | REQ-055 | Pass |
| UAT-073 | REQ-056 | Pass |
| UAT-074 | REQ-057 | Pass |
| UAT-075 | REQ-058 | Pass |

## Open for INT-80

Remaining `Not Run` rows: UAT-015, UAT-028, UAT-040, UAT-044, UAT-047, UAT-050, UAT-051, UAT-053, UAT-061, UAT-064, UAT-067.

Blockers: Stripe test keys not seeded in OpenBao (`payments`/`invoicing` Secrets only have `seeded`); multi-community / second IdP not provisioned; pilot lead for NFR-008 / NFR-016. Refresh INT-81 after those land.

