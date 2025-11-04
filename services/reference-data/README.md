# `services/reference-data` (AC-13)

Internal reference data for settlement (INT-102 / TD-4).

| Operation | Path | Spec |
|---|---|---|
| GetRate | `GET /internal/v1/rates?currency&date` | REQ-002, P-FX → AC-15 fixture |
| FetchRates | `POST /internal/v1/rates:fetch` | REQ-002 (AC-14) |
| GetVatRate | `GET /internal/v1/communities/{id}/vat-rate` | BR-07 |

Contract: `contracts/openapi/internal/reference-data.v1.yaml`. V1 FX rates come from `@intelligent/mocks` scenario S8 (ECB). Stripe is not involved.
