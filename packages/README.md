# packages/

Shared code for the services and the web app:
- `module-template/`: the NestJS base used by every module. It provides health endpoints, typed configuration, the Keycloak auth guard (role and community scope), the transactional outbox, the idempotent NATS consumer, OpenTelemetry, and redaction of personal data in logs.
- `public-api-client/`: TypeScript types for the public `/v1` OpenAPI (INT-244 / `openapi-typescript`). Regenerate with `pnpm --filter @intelligent/public-api-client generate`. Never edit `schema.d.ts` by hand.
- `clients/`: additional generated clients (Orval) as modules adopt them. Never edit them by hand.
- `testing/`: test helpers, Stripe test fixtures, and UAT scenario utilities.

<!-- INT-321: touch packages/ to force full GHCR republish after intelligent-eu-bps-source rename (selective supply-chain skipped images). -->
