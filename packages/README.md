# packages/

Shared code for the services:

- `module-template/`: the NestJS base used by every module. It provides health endpoints, typed configuration, the Keycloak auth guard (role and community scope), the transactional outbox, the idempotent NATS consumer, OpenTelemetry, and redaction of personal data in logs.
- `ewds-client/`: EWDS transport and schema helpers for modules that publish or consume billing records and commands.
- `clients/`: additional generated clients (Orval) as modules adopt them. Never edit them by hand.
- `testing/`: test helpers, Stripe test fixtures, and UAT scenario utilities.

**INT-455:** `public-api-client/` was removed with the public `/v1` OpenAPI.

<!-- INT-321: touch packages/ to force full GHCR republish after intelligent-eu-bps-source rename (selective supply-chain skipped images). -->