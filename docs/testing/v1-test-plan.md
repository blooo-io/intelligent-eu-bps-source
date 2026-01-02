# V1 test plan

The acceptance cases are the UAT notes in [`docs/requirements/items/uat/`](../requirements/items/uat/). This plan does not restate them. Jira records the `UAT-xxx` identifier and the link to that note. It does not hold the case text.

## Traceability

The source of truth is one note per item under `docs/requirements/items/`:

| Item | Path | Role |
|---|---|---|
| Requirement | `items/requirements/REQ-xxx.md` or `NFR-xxx.md` | Statement, priority, `scope_d55`, links to stories and UAT |
| User story | `items/user-stories/US-xxx.md` | Source of a requirement |
| UAT | `items/uat/UAT-xxx.md` | Given / when / then, and the result |

A requirement is ready when it has at least one source story and at least one UAT note. That rule is in [`docs/requirements/requirements.md`](../requirements/requirements.md).

Each UAT note carries `status`: `Not Run`, `Pass`, `Fail` or `Blocked`, plus `last_run` and `tester` when it has been executed. The narrative view is [`docs/requirements/uat-test-cases.md`](../requirements/uat-test-cases.md). The coverage checks are in [`docs/requirements/traceability-dashboard.md`](../requirements/traceability-dashboard.md). Both are generated from the notes. They are not a second catalogue.

When a UAT passes, the same change updates `status` in its note. The test name and the pull request cite the `REQ-xxx` / `UAT-xxx` they cover.

## What V1 runs

| Level | Where it lives | Pass means |
|---|---|---|
| Unit and component | The module test script, 80% statements, branches, functions and lines | GitHub Actions is green; consolidated snapshot in [`v1-unit-component-evidence.md`](v1-unit-component-evidence.md) (INT-73) |
| Contract | `contracts/`, Spectral, Redocly, AsyncAPI and oasdiff | No unannounced breaking change |
| Acceptance | `docs/requirements/items/uat/`, `scope_d55: in` | The note status is `Pass` |
| Integration scenarios | [`docs/architecture/03-application-architecture.md`](../architecture/03-application-architecture.md) §8, S1–S13, mocks and Stripe test mode | Prepared and executed by the later testing tasks, against the UAT notes those scenarios validate |

Requirements with priority **W**, and UAT notes with `scope_d55: out`, stay in the catalogue for traceability and are not executed for D5.5. V1 external systems other than Stripe test mode go through the mocks (assumption A32).

## Evidence

A test run records its evidence in the UAT note (`status`, `last_run`, `tester`, and a short run note). It does not open a Jira issue per case and does not copy the case into the issue.
