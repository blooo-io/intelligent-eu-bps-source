---
title: EWDS project-path E2E (INT-453)
date: 2026-11-26
---
# EWDS project-path E2E — full scenario coverage

## Scope

Automated **end-to-end** coverage of every use case in [`docs/architecture/07-scenario-flows.md`](../architecture/07-scenario-flows.md) (**S1–S14**) on the **project EWDS path** (records + command channel).

Not Playwright against `apps/web` (`/v1` reference client). Not live EWAG grants (submit later).

Transport stand-in: **Mock CGW** (`@intelligent/ewds-client`, INT-441). Module journeys run in-process across AC-03 / AC-04 / AC-10 / AC-12 sources.

## Suite entry points (CI)

| Package / path | What it proves |
|---|---|
| `@intelligent/ewds-project-path-e2e` | **Master gate** — S1–S14 journeys + registry fails if any scenario unmarked |
| `@intelligent/ewds-client` `ewds-project-path-wire.e2e.spec.ts` | Schema-valid examples for all record topics + Mock CGW command round-trip |

Run locally:

```bash
pnpm --filter @intelligent/ewds-project-path-e2e test
pnpm --filter @intelligent/ewds-client test
```

## Scenario matrix

| Scenario | REQ | UAT | Primary assertion |
|---|---|---|---|
| S1 Onboard | REQ-008 | UAT-008 | Actor sync → `source=ewds`, ProfileCompleted |
| S2 Profile update | REQ-009 | UAT-009 | Actor version bump; `PUT` profile → `409 profile_managed_by_ewds` |
| S3 Terms | REQ-050 | UAT-062 | `acceptTermsForActor` → `UserAccountStatusChanged` → `billingKycStatus` |
| S4 KYC / PM | REQ-051, REQ-040 | UAT-063, UAT-051 | KYC apply keeps T&C; command wire `startKyc` / `setupPaymentMethod` |
| S5 Readiness | REQ-045 | UAT-056 | Ladder → Ready (profile + terms + PM + KYC) |
| S6 Trades | REQ-001, REQ-058 | UAT-001, UAT-075 | EWDS `tradesQuery` → settled EnergyTrade only |
| S7 Billing run | REQ-054, REQ-059, REQ-048 | UAT-071, UAT-076, UAT-070 | `triggerBillingRun` + `billingStatement` / `billingInvoice` |
| S8 Pay | REQ-014 | UAT-014 | `startPayment` Checkout handoff + `billingPayment` |
| S9 Failure | REQ-016, REQ-061 | UAT-016, UAT-078 | Failed `billingPayment` + `sendReminder` |
| S10 Payout | REQ-015, REQ-060 | UAT-015, UAT-077 | `requestWithdrawal` + `billingPayout` |
| S11 Invoice status | REQ-044 | UAT-055 | `setInvoiceStatus` + republished `billingInvoice` |
| S12 Erasure | REQ-013 | UAT-013 | EWDS erasure adapter (controller DID, ids only) |
| S13 Commands | REQ-052 | UAT-064 | All 8 ops on Mock CGW + authz deny for member `triggerBillingRun` |
| S14 Purge | REQ-053 | UAT-069 | `purgeCache` (≤ 7 days) |

## Evidence packs (INT-458) — input / output per scenario

```bash
EWDS_EVIDENCE_DIR=$PWD/docs/testing/evidence/$(date -u +%F) \
  pnpm --filter @intelligent/ewds-project-path-e2e test
# → ewds-s01…s14/input.json + output.json + s1-s14-index.json
```

**Stripe honesty:** EWDS journeys label money paths `run_path: mock` (stubs). Live Stripe test proofs for S4/S8/S10:

```bash
EVIDENCE_DIR=docs/testing/evidence/$(date -u +%F) node scripts/stripe-scenario-proof.mjs
```

See `docs/testing/evidence/2026-11-26/README.md`.

## Cluster path (INT-454) — Mock CGW on destinDev

Live pods on `k8s-intelligent-eu-dev` with **Mock CGW** as the transport (not EWAG Spine):

| Piece | Role |
|---|---|
| `services/mock-cgw` | Cluster image; `0.0.0.0:8080`, `/health`, `/test/v1/inject` |
| `deploy/charts/mock-cgw` + `deploy/argocd/dev/mock-cgw.yaml` | GitOps |
| `deploy/envs/dev/values.yaml` | `CGW_BASE_URL=http://mock-cgw:8080`, Mock DID allow-list |
| `@intelligent/ewds-cluster-e2e` | Driver (inject S1 actors + S13 commands) |
| `.github/workflows/ewds-e2e-dev.yml` | Port-forward + run driver after supply-chain |

Evidence label: **`run_path: mock`**. Decision: `docs/architecture/decisions/INT-454-mock-cgw-cluster.md`.

```bash
# Local against a port-forwarded Mock CGW:
kubectl -n int-apps port-forward svc/mock-cgw 18080:8080
MOCK_CGW_BASE_URL=http://127.0.0.1:18080 pnpm --filter @intelligent/ewds-cluster-e2e test
```

## Out of scope (still)

- Live EWAG topic grants / production CGW identity (`live-cgw`)
- R2M UI automation (they consume the wire we publish)
