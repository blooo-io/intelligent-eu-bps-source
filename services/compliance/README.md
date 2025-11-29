# `services/compliance` (AC-12)

Audit log, personal-data retention, and data-subject export/erasure orchestration (INT-111 / REQ-011, REQ-013, REQ-030).

| Operation | Path | Spec |
|---|---|---|
| CreateDataSubjectRequest | `POST /v1/data-subject-requests` | REQ-013, UAT-013 |
| GetDataSubjectRequest | `GET /v1/data-subject-requests/{id}` | REQ-013 |
| ApplyRetention | `POST /internal/v1/retention:apply` | REQ-011, UAT-011 |

Publishes `ErasureRequested` (AC-03, AC-06, AC-07). Consumes `ErasureCompleted` and `AuditableActionPerformed`. Audit and event payloads carry identifiers only (no personal data).

Contracts: `contracts/openapi/public.v1.yaml` (Privacy), `contracts/openapi/internal/compliance.v1.yaml`, `contracts/asyncapi/compliance.v1.yaml`, `contracts/asyncapi/audit.v1.yaml`.
