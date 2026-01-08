# V1 integration execution log (INT-75)

Prepared cases: [`v1-integration-scenarios.md`](v1-integration-scenarios.md) (INT-74).  
Environment: module test runners with AC-15 fixtures (`createMockSuite`); Stripe paths via mock PSP / test-mode adapters. Cluster-wide authenticated e2e remains a follow-up where OIDC test users are required.

**Run date:** 2026-10-17  
**Tester:** automated (agent)  
**Branch evidence:** `cursor/int-75-integration-exec-d55f`

## Results by scenario

| Scenario | UAT | Result | Evidence |
|---|---|---|---|
| S1 | UAT-071 | Pass | `services/settlement` — two pair settlements for two producers |
| S2 | UAT-072 | Pass | `services/settlement` — single netted pair settlement |
| S3 | UAT-073 | Pass (prior) | Carry-forward under threshold; portal/billing notes already Pass |
| S4 | UAT-075 | Pass (prior) | `services/trade-intake` unknown-party anomaly |
| S5 | UAT-052 | Pass | `services/reconciliation` + mock clearing mismatch |
| S6+S7 | UAT-001 | Pass | Mock S6/S7 flags; intake stores duplicate `tradeId` once (S7) |
| S8 | UAT-002 | Pass | `services/settlement` CHF + ECB fixture rate `0.94` |
| S9 | UAT-074 | Pass (prior) | Early settlement ignores threshold |
| S10 | UAT-016 | Pass | `services/payments` failure categories on pay / webhook path |
| S10 KPIs | UAT-057 | Pass | Fixed on INT-82 — KPI CSV includes cause, corrective action, processingTimeMs |
| S11 | UAT-056 | Pass | `services/invoicing` holds until producer readiness (BR-09 / KYC gate) |
| S12 | UAT-013 | Pass (prior) | `services/compliance` erasure propagation |
| S13 | UAT-070 | Pass | `mocks` data-space schema validation + `services/publication` |

## Defects

| Id | Severity | Summary | Related |
|---|---|---|---|
| D-INT-75-01 | Medium | ~~KPI CSV missing REQ-046 fields~~ — fixed in INT-82 (`recordType=payment` rows). | UAT-057 |

## Commands run (this execution)

```bash
pnpm --filter @intelligent/mocks test
pnpm --filter @intelligent/settlement test
pnpm --filter @intelligent/trade-intake test
pnpm --filter @intelligent/payments test
pnpm --filter @intelligent/reconciliation test
pnpm --filter @intelligent/compliance test
pnpm --filter @intelligent/invoicing test
pnpm --filter @intelligent/publication test
pnpm --filter @intelligent/reporting test
```

All listed suites green after the S7/S8 gap-closing cases landed on this branch.
