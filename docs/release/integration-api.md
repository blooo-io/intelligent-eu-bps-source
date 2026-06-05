# Integration and API documentation (INT-94 / INT-244)

**Contract first.** Integrators consume the OpenAPI and AsyncAPI artefacts under [`contracts/`](../../contracts/). Generated clients and Nest validators must match those files. Narrative architecture: [`docs/architecture/03-application-architecture.md`](../architecture/03-application-architecture.md).

## Developer API portal (INT-244)

Browsable public OpenAPI (Redocly) and a short integrator landing page:

| Host | Content |
|---|---|
| `https://docs.intelligent-eu-bp.blooo.dev` | Landing + `/api.html` (Redocly) + `/public.v1.yaml` |
| Workspace package `@intelligent/public-api-client` | TypeScript types from `public.v1.yaml` (`openapi-typescript`) |

Internal OpenAPI and AsyncAPI are **not** published on the docs host.

### Auth for integrators

1. Register an OIDC public client (PKCE) against the realm for your environment (`int` on `dev`).
2. Obtain an access token; send `Authorization: Bearer <token>` on every `/v1` call.
3. Roles (`member` / `manager` / `operator`) and community scope come from token claims; the API enforces own-community only (REQ-010). Missing or invalid tokens return **401**.
4. Errors use the shared problem shape in the public OpenAPI; do not invent status codes outside the contract.

### TypeScript types

```bash
pnpm --filter @intelligent/public-api-client generate
```

Import path/operation/schema types from `@intelligent/public-api-client`. The package does not ship a runtime HTTP client — use `fetch` (or your stack) with the bearer token.

## REST — OpenAPI 3.1

| Contract | Audience | Served by |
|---|---|---|
| [`contracts/openapi/public.v1.yaml`](../../contracts/openapi/public.v1.yaml) | Browser / partner clients via APISIX `/v1` | AC-01 web + gateway; modules behind AC-02 |
| [`contracts/openapi/internal/*.v1.yaml`](../../contracts/openapi/internal/) | Service-to-service | Nest modules AC-03…AC-14 |
| [`contracts/openapi/webhooks/payment-provider.v1.yaml`](../../contracts/openapi/webhooks/payment-provider.v1.yaml) | Stripe webhooks | AC-07 payments |
| [`contracts/openapi/components/schemas.yaml`](../../contracts/openapi/components/schemas.yaml) | Shared schemas | — |

Index and lint notes: [`contracts/README.md`](../../contracts/README.md).

### Auth (public API)

- OIDC (Keycloak) with PKCE for the web app.
- Roles: member, manager, operator (see public OpenAPI security schemes).
- Unauthenticated calls to protected routes return **401**.

### Base URLs (dev)

| Host | Use |
|---|---|
| `https://api.dev.intelligent-eu-bp.blooo.dev` | Public REST `/v1` |
| `https://app.dev.intelligent-eu-bp.blooo.dev` | Reference web app |
| `https://docs.intelligent-eu-bp.blooo.dev` | API portal (Redocly) |
| `https://auth.intelligent-eu-bp.blooo.dev` | Keycloak |

## Events — AsyncAPI 3

Module event catalogues live under [`contracts/asyncapi/`](../../contracts/asyncapi/):

| File | Producer (typical) |
|---|---|
| `participants.v1.yaml` | AC-03 |
| `trade-intake.v1.yaml` | AC-04 |
| `settlement.v1.yaml` | AC-05 |
| `invoicing.v1.yaml` | AC-06 |
| `payments.v1.yaml` | AC-07 |
| `reconciliation.v1.yaml` | AC-08 |
| `compliance.v1.yaml` | AC-12 |
| `scheduler.v1.yaml` | AC-14 |
| `audit.v1.yaml` | cross-cutting |

Transport: transactional outbox → Debezium → NATS JetStream (TD-7). Consumers are idempotent on `eventId`.

## EWDS publication schemas

Draft topic schemas for `billingInvoice` / `billingPayment`: [`docs/architecture/ewds-topics/`](../architecture/ewds-topics/). V1 publication validates against these via the AC-15 data-space mock.

## Compatibility

Breaking REST/event changes require a reviewed contract PR first (`oasdiff` / Spectral / AsyncAPI lint in CI). Do not invent endpoints outside the contracts.
