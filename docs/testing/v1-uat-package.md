# V1 UAT package (INT-79)

Assemble acceptance for partners from the existing UAT notes. **Case text stays in** [`docs/requirements/items/uat/`](../requirements/items/uat/). This package only lists what to run, who runs it, and where evidence goes.

## Package contents

| Item | Location |
|---|---|
| Test plan | [`v1-test-plan.md`](v1-test-plan.md) |
| Confirmed functional set | [`v1-functional-cases.md`](v1-functional-cases.md) (62 `scope_d55: in` notes) |
| Integration scenarios S1–S13 | [`v1-integration-scenarios.md`](v1-integration-scenarios.md) |
| Integration execution | [`v1-integration-execution.md`](v1-integration-execution.md) |
| Functional execution | [`v1-functional-execution.md`](v1-functional-execution.md) |
| Unit/component coverage | [`v1-unit-component-evidence.md`](v1-unit-component-evidence.md) |
| Live environment | `dev` / `int` hosts under `*.intelligent-eu-bp.blooo.dev` (Stripe **test** mode) |

## Participants (who runs what)

| Role | Responsibility | Confirmed |
|---|---|---|
| Blooo engineering (agent / developer) | Module suites, GitOps smoke, record Pass/Fail/Blocked in UAT notes | Yes — INT-75 / INT-78 |
| Blooo operator | Authenticated portal checks on `dev` with Keycloak test users | Pending credentials |
| Pilot / partner UAT lead | Optional: UX step counts (NFR-016 / UAT-067); performance window (NFR-008 / UAT-040) | Criteria TBD or waive |
| Steven Lin (assignee) | Owns recording acceptance in Jira INT-80 | Yes |

## Already accepted (do not re-run unless regressing)

See the Pass rows in [`v1-functional-cases.md`](v1-functional-cases.md) and the two execution logs. After INT-193 (2026-10-18): **57 Pass**, **5 Blocked** in-scope, **0 Fail**. UAT-067 Pass (wizard journey; step-count deferred). UAT-051 Pass; UAT-044 / UAT-047 out.

## Remaining Blocked cases (in-scope)

| UAT | Requirement | Blocker |
|---|---|---|
| UAT-015 | REQ-015 | Connect account `charges_enabled` + destination payout (test mode) |
| UAT-028 | REQ-028 | Seeded trade→payment for operator trace (after Connect pay) |
| UAT-040 | NFR-008 | Agreed billing-run duration target (or waive) |
| UAT-050 | REQ-039 | Stripe invoice PDF — depends on Connect charges |
| UAT-053 | REQ-042 | Stripe numbering — depends on Connect invoices |

## How to record a result (INT-80)

1. Open the UAT note under `docs/requirements/items/uat/`.
2. Set `status` to `Pass`, `Fail` or `Blocked`; set `last_run` and `tester`.
3. Append a short run note (no personal data).
4. Failures that block freeze go to INT-82.

## Confirmation checklist

- [x] Package points at docs notes only (no duplicated Given/When/Then)
- [x] Runners identified
- [x] Remaining set listed for INT-80
- [ ] Pilot / partner UAT lead named (human confirmation)
