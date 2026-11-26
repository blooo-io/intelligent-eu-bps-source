# `services/reporting` (AC-09)

Manager/operator read models built from billing events (INT-112 / INT-82 / REQ-018, REQ-031, REQ-032, REQ-046, REQ-047).

| Operation | Path | Spec |
|---|---|---|
| GetPaymentsOverview | internal API; surfaced to the project UI through EWDS records | REQ-018, UAT-018 |
| GetParticipantHistory | internal API; surfaced through EWDS records | REQ-031, UAT-031 |
| GetPeriodicSummary | internal API; surfaced through EWDS records | REQ-032, UAT-032 |
| GetKpiExport | internal API (operator) | REQ-046, REQ-047, UAT-057, UAT-058 |
| BuildReport | `POST /internal/v1/reports:build` | REQ-032 |
| ExportKpi | `POST /internal/v1/kpi-exports` | REQ-046, REQ-047 |

Contracts: `contracts/openapi/internal/reporting.v1.yaml`.
