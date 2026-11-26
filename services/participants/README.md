# `services/participants` (AC-03)

Participants and communities (INT-103 / LB-02).

| Operation | Path | Spec |
|---|---|---|
| ResolveParty | `POST /internal/v1/parties:resolve` | REQ-058 |
| GetCommunitySettings | `GET /internal/v1/communities/{id}/settings` | REQ-006 |
| CheckReadiness | `GET /internal/v1/participants/{id}/readiness` | BR-09 |
| Profile / terms acceptance | EWDS command `acceptTerms` (AC-10 → internal API) | REQ-009, REQ-049, REQ-050 |
| Community settings / import / offboard | internal API (operator / peers); actor data from R2M via the EWDS `actor` topic | REQ-008, REQ-012, REQ-058 |

Contracts: `contracts/openapi/internal/participants.v1.yaml`, `contracts/asyncapi/participants.v1.yaml`.

V1 stores data in memory (PostgreSQL wiring follows with CNPG). **INT-463:** member IdP create/invite/erase is owned by R2M; AC-03 no longer calls Keycloak Admin. Retained `services/participants/src/idp/*` adapters are unused on the product path (tests / historical).
