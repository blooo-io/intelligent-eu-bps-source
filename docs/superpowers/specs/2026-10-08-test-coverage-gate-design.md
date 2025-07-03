# Test coverage gate design

## Goal

Every code development must include automated tests. Each independently tested
workspace or module must maintain at least 80% coverage for statements,
branches, functions and lines. GitHub Actions must block a pull request when any
module misses one of these thresholds.

## Scope

The policy applies to all executable TypeScript code added under `apps/`,
`services/`, `packages/` and `mocks/`. Generated code, declarations, test
fixtures, migrations and configuration-only files may be excluded explicitly
from instrumentation. Exclusions must not hide executable business logic.

Contract validation, UAT scenarios and end-to-end tests remain separate quality
controls. They do not replace unit or component coverage.

## Repository design

- The root workspace exposes a single coverage command that runs the coverage
  command of every applicable workspace.
- Each workspace owns its test-runner configuration and enforces 80% for all
  four metrics. A repository-wide aggregate is not used as a substitute for
  per-workspace thresholds.
- New executable workspaces must provide the expected test and coverage scripts
  when they are introduced.
- Coverage output uses a common `coverage/` location per workspace and is not
  committed.

## Continuous integration

GitHub Actions runs the root coverage command for pull requests and pushes to
`develop`. The job fails when tests fail, a workspace cannot produce coverage,
or any metric is below 80%.

Coverage reports are uploaded as workflow artifacts even when the threshold
step fails, so failures can be diagnosed. The job uses the repository's pinned
Node.js and pnpm versions and the lockfile.

The initial CI change establishes the gate before application modules exist.
The first implementation of each module supplies its runner configuration and
tests, making that module subject to the gate in the same pull request.

## Jira traceability

A dedicated sub-task under INT-70 tracks installation of the monorepo coverage
gate in GitHub Actions. INT-73 tracks consolidated test evidence.

Every development ticket must include these completion criteria:

- automated tests cover the behavior introduced or changed;
- statements, branches, functions and lines are each at least 80% for every
  affected module;
- the GitHub Actions coverage job passes.

This criterion is applied to current implementation tickets and becomes the
default for future development tickets. Requirement prose remains in the
repository; Jira references this policy instead of duplicating it.

## Failure behavior

Coverage is a blocking check. There is no automatic bypass. A justified
exclusion or temporary exception requires an explicit repository change that is
reviewed in the pull request and linked to a Jira ticket.

## Acceptance criteria

1. One root command runs coverage for every executable workspace.
2. Each workspace fails below 80% for statements, branches, functions or lines.
3. GitHub Actions runs the command on pull requests and pushes to `develop`.
4. Coverage reports are retained as workflow artifacts.
5. Jira contains the implementation task and current development tickets carry
   the shared completion criteria.
