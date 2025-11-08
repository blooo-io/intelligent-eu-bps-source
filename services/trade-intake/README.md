# `services/trade-intake` (AC-04)

Market trade intake (INT-104 / LB-03). V1 market port is `@intelligent/mocks` (P-MKT).

| Operation | Path | Spec |
|---|---|---|
| GetUnbilledTrades | `GET /internal/v1/trades/unbilled` | REQ-001 |
| RefreshIntake | `POST /internal/v1/intake:refresh` | REQ-001, BR-01, BR-02 |
| CheckIntakeHealth | `POST /internal/v1/intake:check-health` | REQ-029 |

Business rules: BR-01 (settled once), BR-02 (delivery period from market), BR-11 (never change trade status).

Contract: `contracts/openapi/internal/trade-intake.v1.yaml`, `contracts/asyncapi/trade-intake.v1.yaml`.
