# `@intelligent/public-api-client`

TypeScript types for the **public** Billing & Payment API (`contracts/openapi/public.v1.yaml`).

Regenerate after a public contract change:

```bash
pnpm --filter @intelligent/public-api-client generate
```

Integrators import path/operation/schema types only — this package does not ship a runtime HTTP client (fetch + OIDC bearer stays in the caller). See [`docs/release/integration-api.md`](../../docs/release/integration-api.md).
