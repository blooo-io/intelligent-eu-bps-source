# V1 unit and component test evidence (INT-73)

Policy: [`docs/superpowers/specs/2026-10-08-test-coverage-gate-design.md`](../superpowers/specs/2026-10-08-test-coverage-gate-design.md). Gate: INT-150. Every executable workspace must stay at or above 80% statements, branches, functions and lines.

## How evidence is produced

GitHub Actions workflow `ci` runs `scripts/run-tests.mjs` on every pull request and on every push to `develop`. That script runs each workspace `test:coverage` script and uploads the `coverage` artifact (`**/coverage/**`).

This note consolidates one green `develop` run. It does not replace the live gate or the per-module Vitest reports.

## Snapshot

| Field | Value |
|---|---|
| Commit | `426819c20bbcf013fda1931b5d69e2089891d3fd` (`develop`, INT-149) |
| Workflow run | https://github.com/blooo-io/intelligent-eu-billing-and-payment/actions/runs/39051194204 |
| Job | `test` — success |
| Artifact | `coverage` (retained on the run) |
| Thresholds | `config/coverage-thresholds.json` — 80 / 80 / 80 / 80 |

### Coverage by module (from the uploaded artifact)

| Module | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| `apps/web` | 98.89% | 81.08% | 94.44% | 98.89% |
| `mocks` | 100.00% | 89.18% | 100.00% | 100.00% |
| `packages/module-template` | 100.00% | 100.00% | 100.00% | 100.00% |
| `services/cd-smoke` | 94.28% | 93.33% | 100.00% | 94.28% |
| `services/compliance` | 95.31% | 81.81% | 97.91% | 95.31% |
| `services/invoicing` | 98.47% | 87.50% | 100.00% | 98.47% |
| `services/notification` | 93.88% | 97.50% | 100.00% | 93.88% |
| `services/participants` | 97.33% | 91.61% | 100.00% | 97.33% |
| `services/payments` | 99.21% | 88.46% | 100.00% | 99.21% |
| `services/publication` | 89.08% | 85.00% | 86.48% | 89.08% |
| `services/reconciliation` | 99.63% | 95.83% | 100.00% | 99.63% |
| `services/reference-data` | 100.00% | 100.00% | 100.00% | 100.00% |
| `services/reporting` | 94.66% | 92.78% | 95.00% | 94.66% |
| `services/scheduler` | 96.97% | 92.53% | 93.10% | 96.97% |
| `services/settlement` | 92.80% | 83.54% | 100.00% | 92.80% |
| `services/trade-intake` | 95.73% | 84.61% | 100.00% | 95.73% |

All sixteen executable workspaces meet the 80% gate on this run.

## Refresh

After a later green `develop` `ci` run, download the `coverage` artifact and replace the snapshot table and commit/run fields. Keep the module list complete; do not drop a workspace that still has `test:coverage`.
