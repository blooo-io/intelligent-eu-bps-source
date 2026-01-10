# V1 functional and system test cases (INT-76)

The functional and system cases for V1 are the UAT notes with `scope_d55: in` under [`docs/requirements/items/uat/`](../requirements/items/uat/).
This note **confirms the set to execute** under INT-78. It does not copy Given/When/Then text — that stays in each UAT note (INT-71).

See also: [`v1-test-plan.md`](v1-test-plan.md), [`v1-integration-scenarios.md`](v1-integration-scenarios.md) (S1–S13 subset).

## Confirmed set

Count: **64** in-scope UAT notes.

| UAT | Requirement | Status at INT-76 |
|---|---|---|
| UAT-001 | REQ-001 | Pass |
| UAT-002 | REQ-002 | Pass |
| UAT-003 | REQ-003 | Not Run |
| UAT-005 | REQ-005 | Not Run |
| UAT-006 | REQ-006 | Pass |
| UAT-007 | REQ-007 | Pass |
| UAT-008 | REQ-008 | Pass |
| UAT-009 | REQ-009 | Pass |
| UAT-010 | REQ-010 | Not Run |
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
| UAT-033 | NFR-001 | Not Run |
| UAT-034 | NFR-002 | Not Run |
| UAT-035 | NFR-003 | Not Run |
| UAT-036 | NFR-004 | Not Run |
| UAT-037 | NFR-005 | Not Run |
| UAT-038 | NFR-006 | Not Run |
| UAT-039 | NFR-007 | Not Run |
| UAT-040 | NFR-008 | Not Run |
| UAT-041 | NFR-009 | Not Run |
| UAT-042 | NFR-010 | Not Run |
| UAT-043 | REQ-033 | Pass |
| UAT-044 | REQ-034 | Not Run |
| UAT-045 | REQ-035 | Not Run |
| UAT-046 | REQ-036 | Not Run |
| UAT-047 | REQ-037 | Not Run |
| UAT-049 | NFR-011 | Not Run |
| UAT-050 | REQ-039 | Not Run |
| UAT-051 | REQ-040 | Not Run |
| UAT-052 | REQ-041 | Pass |
| UAT-053 | REQ-042 | Not Run |
| UAT-054 | REQ-043 | Pass |
| UAT-055 | REQ-044 | Pass |
| UAT-056 | REQ-045 | Pass |
| UAT-057 | REQ-046 | Pass |
| UAT-058 | REQ-047 | Pass |
| UAT-059 | NFR-012 | Not Run |
| UAT-060 | REQ-049 | Pass |
| UAT-061 | NFR-013 | Not Run |
| UAT-062 | REQ-050 | Pass |
| UAT-063 | REQ-051 | Pass |
| UAT-064 | REQ-052 | Not Run |
| UAT-065 | NFR-014 | Not Run |
| UAT-066 | NFR-015 | Not Run |
| UAT-067 | NFR-016 | Not Run |
| UAT-068 | NFR-017 | Not Run |
| UAT-069 | REQ-053 | Pass |
| UAT-070 | REQ-048 | Pass |
| UAT-071 | REQ-054 | Pass |
| UAT-072 | REQ-055 | Pass |
| UAT-073 | REQ-056 | Pass |
| UAT-074 | REQ-057 | Pass |
| UAT-075 | REQ-058 | Pass |

## Execution

- INT-78 runs this set and updates each note's `status` / `last_run` / `tester` / run notes.
- INT-80 covers partner UAT packaging of the same catalogue.
- Do not invent new UAT IDs; gaps go to INT-82.

