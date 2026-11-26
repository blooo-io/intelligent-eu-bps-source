# API & events

**INT-455** — the public REST OpenAPI `/v1` catalogue and interactive browser are withdrawn.

| Resource | Path |
|---|---|
| EWDS integration overview | [/api/](/api/) |
| Architecture — EWDS topics | [/architecture/ewds-topics](/architecture/ewds-topics) |
| Command channel & adapters | [/architecture/ewds-client-gateway](/architecture/ewds-client-gateway) |
| Repository contracts | [integration-api.md](https://github.com/blooo-io/intelligent-eu-bps-source/blob/develop/docs/release/integration-api.md) |

External integration is **EWDS-only** (published billing records + billing command channel). Payment-provider webhooks use `contracts/openapi/webhooks/payment-provider.v1.yaml`.

## Internal APIs

Module-to-module HTTP APIs live under `contracts/openapi/internal/`. They are not a public product surface; call them only from trusted cluster network paths with service tokens.

## Events

AsyncAPI 3 documents under `contracts/asyncapi/` describe domain events. Delivery path: module outbox table → CDC (Debezium in the reference stack) → NATS JetStream. Consumers must be idempotent.

## Further reading

- [Docs hosting & URL](/guide/docs-hosting)
- [Integration notes](https://github.com/blooo-io/intelligent-eu-bps-source/blob/develop/docs/release/integration-api.md)
- Technical decision TD-13 (contract-first tooling) in the technical architecture