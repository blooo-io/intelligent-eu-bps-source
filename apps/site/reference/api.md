# API & events

## Public REST API

- Contract: [`contracts/openapi/public.v1.yaml`](https://github.com/blooo-io/intelligent-eu-billing-and-payment/blob/develop/contracts/openapi/public.v1.yaml)
- Style: versioned `/v1`, OIDC bearer tokens
- Human-readable portal (Redocly): deployable app `apps/docs-portal` (INT-244 / REQ-052)

Integrators should treat the **OpenAPI file** as authoritative. Breaking changes require a new major path (`/v2`) and are checked with oasdiff in CI.

## Internal APIs

Module-to-module HTTP APIs live under `contracts/openapi/internal/`. They are not public; call them only from trusted cluster network paths.

## Events

AsyncAPI 3 documents under `contracts/asyncapi/` describe domain events. Delivery path: module outbox table → CDC (Debezium in the reference stack) → NATS JetStream. Consumers must be idempotent.

## Further reading

- [Integration notes](https://github.com/blooo-io/intelligent-eu-billing-and-payment/blob/develop/docs/release/integration-api.md)
- Technical decision TD-13 (contract-first tooling) in the technical architecture
