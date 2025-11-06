# `services/participants` (AC-03)

Participants and communities (INT-103 / LB-02).

| Operation | Path | Spec |
|---|---|---|
| ResolveParty | `POST /internal/v1/parties:resolve` | REQ-058 |
| GetCommunitySettings | `GET /internal/v1/communities/{id}/settings` | REQ-006 |
| CheckReadiness | `GET /internal/v1/participants/{id}/readiness` | BR-09 |
| getMe / profile / terms | `/v1/me…`, `/v1/terms/current` | REQ-009, REQ-049, REQ-050 |
| Community settings / import / offboard | `/v1/communities/{id}/…` | REQ-008, REQ-012, REQ-058 |

Contracts: `contracts/openapi/internal/participants.v1.yaml`, `contracts/openapi/public.v1.yaml` (AC-03 paths), `contracts/asyncapi/participants.v1.yaml`.

V1 stores data in memory (PostgreSQL wiring follows with CNPG). Identity-provider admin calls go through P-IDP (`createUser`, `sendInvitation`, `deleteUser`) with a mock adapter in tests.
