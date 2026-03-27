-- INT-207 / TD-7 — transactional outbox table (one per module database).
-- Debezium Server CDC reads this table and publishes to NATS JetStream.
-- Append-only: no UPDATE/DELETE from application code (NFR-003).

CREATE TABLE IF NOT EXISTS outbox (
  id              UUID PRIMARY KEY,
  aggregate_type  TEXT NOT NULL,
  aggregate_id    TEXT NOT NULL,
  event           JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outbox_created_at_idx ON outbox (created_at);
