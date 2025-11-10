# `services/settlement` (AC-05)

Pair settlement, netting, threshold/carry-forward, FX and VAT (INT-105 / LB-04).

| Operation | Path | Spec |
|---|---|---|
| GetPairSettlement | `GET /internal/v1/settlements/{id}` | REQ-002 |
| StartRun | `POST /internal/v1/billing-runs` | REQ-006, REQ-055..057 |

Business rules: BR-03..BR-08, BR-12, BR-13. V1 trade source and FX come from `@intelligent/mocks` fixtures until HTTP clients to AC-04 / AC-13 land.

Contract: `contracts/openapi/internal/settlement.v1.yaml`.
