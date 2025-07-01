# packages/

Shared code for the services and the web app:
- `module-template/`: the NestJS base used by every module. It provides health endpoints, typed configuration, the Keycloak auth guard (role and community scope), the transactional outbox, the idempotent NATS consumer, OpenTelemetry, and redaction of personal data in logs.
- `clients/`: clients generated from `contracts/` (Orval / openapi-typescript). Never edit them by hand.
- `testing/`: test helpers, Stripe test fixtures, and UAT scenario utilities.
