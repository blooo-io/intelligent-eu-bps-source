# API & events

The interactive reference lives under **[/api/](/api/)** — VitePress pages driven by [vitepress-openapi](https://vitepress-openapi.vercel.app/) from [`contracts/openapi/public.v1.yaml`](https://github.com/blooo-io/intelligent-eu-bps-source/blob/develop/contracts/openapi/public.v1.yaml) (INT-302).

| Resource | Path |
|---|---|
| Overview + full spec | [/api/](/api/) |
| Per-operation pages | [/api/operations/…](/api/) (sidebar) |
| Raw YAML | [/openapi/public.v1.yaml](/openapi/public.v1.yaml) |

Playground default server for Try it out: `https://api.dev.intelligent-eu-bp.blooo.dev/v1` (OIDC bearer). Override the list at build time with `DOCS_API_SERVERS` (JSON), or type a custom URL in the UI.

::: tip Standalone portal
`apps/docs-portal` (Redocly) remains available if you want a separate API-only deploy. The docs site no longer embeds Redoc; vitepress-openapi is the in-site explorer.
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

- [Docs hosting & URL](/guide/docs-hosting)
- [Integration notes](https://github.com/blooo-io/intelligent-eu-bps-source/blob/develop/docs/release/integration-api.md)
- Technical decision TD-13 (contract-first tooling) in the technical architecture
