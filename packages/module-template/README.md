# @intelligent/module-template

Shared NestJS base (TD-4): health, config, outbox, idempotent consumer, auth guard, OTel.

## Outbox (TD-7 / INT-207)

- Default: `InMemoryOutboxStore` (unit tests / CI without Postgres).
- Durable path: apply `sql/outbox.sql` on each module database, then inject
  `PostgresOutboxStore` (or `resolveOutboxStore` with `DATABASE_URL` + a `pg`
  pool factory). Debezium Server CDC publishes rows to NATS JetStream; modules
  never publish to the bus directly.
