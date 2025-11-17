# `services/reconciliation` (AC-08)

Invoice↔payment and market↔clearing reconciliation (INT-108 / REQ-041).

| Operation | Path | Spec |
|---|---|---|
| Reconcile | `POST /internal/v1/reconciliation:run` | REQ-041 |
| ListDiscrepancies | `GET /v1/reconciliation/discrepancies` | REQ-041, UAT-052 |

Publishes `DiscrepancyDetected` (AC-09, AC-11). Read-only on other modules' data: projections are seeded from upstream events in V1 tests.
