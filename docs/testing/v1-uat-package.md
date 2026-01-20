# V1 UAT package (INT-79)

Assemble acceptance for partners from the existing UAT notes. **Case text stays in** [`docs/requirements/items/uat/`](../requirements/items/uat/). This package only lists what to run, who runs it, and where evidence goes.

## Package contents

| Item | Location |
|---|---|
| Test plan | [`v1-test-plan.md`](v1-test-plan.md) |
| Confirmed functional set | [`v1-functional-cases.md`](v1-functional-cases.md) (64 `scope_d55: in` notes) |
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
| Pilot / partner UAT lead | Remaining Not Run cases below; UX step counts (NFR-016); performance window (NFR-008) | To confirm before INT-80 |
| Steven Lin (assignee) | Owns recording acceptance in Jira INT-80 | Yes |

## Already accepted (do not re-run unless regressing)

See the Pass rows in [`v1-functional-cases.md`](v1-functional-cases.md) and the two execution logs. After INT-80 batch: **53 Pass**, **11 Not Run**.

## Remaining cases for INT-80

| UAT | Requirement | Suggested runner |
|---|---|---|
| UAT-015 | REQ-015 | Blooo + Stripe test Connect payout (needs OpenBao Stripe seed) |
| UAT-028 | REQ-028 | Blooo operator (end-to-end trace) |
| UAT-040 | NFR-008 | Pilot (agreed time window) |
| UAT-044 | REQ-034 | Blooo operator (multi-community IdP redirect) |
| UAT-047 | REQ-037 | Blooo (IdP swap without redeploy) |
| UAT-050 | REQ-039 | Blooo + Stripe test PDF |
| UAT-051 | REQ-040 | Blooo operator (embedded onboarding) |
| UAT-053 | REQ-042 | Blooo + Stripe numbering |
| UAT-061 | NFR-013 | Blooo (IdP-vendor-agnostic review + second IdP) |
| UAT-064 | REQ-052 | Blooo operator + partner (API + screens journey) |
| UAT-067 | NFR-016 | Pilot (journey step count) |

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
