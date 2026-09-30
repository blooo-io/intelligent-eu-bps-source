# API & events

Interactive OpenAPI (Redoc) is **built into this site** from [`contracts/openapi/public.v1.yaml`](https://github.com/blooo-io/intelligent-eu-billing-and-payment/blob/develop/contracts/openapi/public.v1.yaml) — same contract and Redocly tooling as `apps/docs-portal` (INT-244 / INT-301).

**Open the full explorer:** [**/api/**](/api/) · raw YAML: [/openapi/public.v1.yaml](/openapi/public.v1.yaml)

<iframe
  src="/api/"
  title="INTELLIGENT Billing API (Redoc)"
  style="width:100%;height:75vh;border:1px solid var(--vp-c-divider);border-radius:8px;background:var(--vp-c-bg)"
></iframe>

::: tip Own deployment
Adopters can still ship `apps/docs-portal` as a standalone portal, or rely only on this embedded `/api/` route. The Blooo sample at [docs.intelligent-eu-bp.blooo.dev/api.html](https://docs.intelligent-eu-bp.blooo.dev/api.html) is optional reference hosting — not required.
:::

## Public REST API

- Style: versioned `/v1`, OIDC bearer tokens
- Integrators treat the **OpenAPI file** as authoritative
- Breaking changes require a new major path (`/v2`) and are checked with oasdiff in CI

## Internal APIs

Module-to-module HTTP APIs live under `contracts/openapi/internal/`. They are not public; call them only from trusted cluster network paths.

## Events

AsyncAPI 3 documents under `contracts/asyncapi/` describe domain events. Delivery path: module outbox table → CDC (Debezium in the reference stack) → NATS JetStream. Consumers must be idempotent.

## Further reading

- [Docs hosting & URL](/guide/docs-hosting) — custom domain vs private Pages host
- [Integration notes](https://github.com/blooo-io/intelligent-eu-billing-and-payment/blob/develop/docs/release/integration-api.md)
- Technical decision TD-13 (contract-first tooling) in the technical architecture
