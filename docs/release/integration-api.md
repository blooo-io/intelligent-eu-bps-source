# Integration and API documentation (INT-94 / INT-455)

**Contract first.** External integration with billing is **EWDS-only** (published records + billing command channel). See [`docs/architecture/decisions/INT-455-remove-public-v1.md`](../architecture/decisions/INT-455-remove-public-v1.md).

Nest modules communicate via **internal** OpenAPI under [`contracts/openapi/internal/`](../../contracts/openapi/internal/). Payment provider webhooks use [`contracts/openapi/webhooks/payment-provider.v1.yaml`](../../contracts/openapi/webhooks/payment-provider.v1.yaml). Events and the EWDS command channel are in [`contracts/asyncapi/`](../../contracts/asyncapi/). Narrative architecture: [`docs/architecture/03-application-architecture.md`](../architecture/03-application-architecture.md).

## EWDS (project UI path)

| Artefact | Purpose |
|---|---|
| [`contracts/asyncapi/ewds-billing.v1.yaml`](../../contracts/asyncapi/ewds-billing.v1.yaml) | Published billing records (statements, invoices, payments, payouts, KYC status) |
| Billing command channel (AsyncAPI) | Actions: pay, withdraw, KYC, terms, reminders, billing runs, etc. |
| [`docs/architecture/ewds-topics/`](../../docs/architecture/ewds-topics/) | Topic schemas and examples |

E2E evidence for the project path: [`docs/testing/ewds-project-path-e2e.md`](../testing/ewds-project-path-e2e.md) (future INT-454 cluster EWDS).

## Internal HTTP (not a public product API)

| Contract | Audience |
|---|---|
| [`contracts/openapi/internal/*.v1.yaml`](../../contracts/openapi/internal/) | Service-to-service between Nest modules (AC-03…AC-14) |
| [`contracts/openapi/components/schemas.yaml`](../../contracts/openapi/components/schemas.yaml) | Shared schemas |

## Webhooks

| Contract | Served by |
|---|---|
| [`contracts/openapi/webhooks/payment-provider.v1.yaml`](../../contracts/openapi/webhooks/payment-provider.v1.yaml) | AC-07 payments (Stripe test/live per community) |

Index and lint notes: [`contracts/README.md`](../../contracts/README.md).

## Developer docs site

Adopter-facing VitePress site: [`apps/site/`](../../apps/site/) (GitHub Pages / `intelligent.docs.blooo.dev`). Architecture views, deploy guide, and EWDS integration notes — not a browsable public REST catalogue (INT-455).