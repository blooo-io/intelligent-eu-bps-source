# `services/reporting` (AC-09)

Manager/operator read models built from billing events (INT-112 / REQ-018, REQ-031, REQ-032, REQ-047).

| Operation | Path | Spec |
|---|---|---|
| GetPaymentsOverview | `GET /v1/communities/{id}/payments-overview` | REQ-018, UAT-018 |
| GetParticipantHistory | `GET /v1/participants/{id}/history` | REQ-031, UAT-031 |
| GetPeriodicSummary | `GET /v1/reports/summary` | REQ-032, UAT-032 |
| GetKpiExport | `GET /v1/kpi-exports/{period}` | REQ-047, UAT-058 |
| BuildReport | `POST /internal/v1/reports:build` | REQ-032 |
| ExportKpi | `POST /internal/v1/kpi-exports` | REQ-047 |

Contracts: `contracts/openapi/public.v1.yaml` (Reports), `contracts/openapi/internal/reporting.v1.yaml`.
