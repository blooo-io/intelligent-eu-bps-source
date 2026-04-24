-- INT-207 / TD-7 — transactional outbox table (one per module database).
-- Debezium Server CDC reads this table and publishes to NATS JetStream.
-- Append-only: no UPDATE/DELETE from application code (NFR-003).
-- INT-214 — `type` column drives EventRouter route (AsyncAPI channel address).

CREATE TABLE IF NOT EXISTS outbox (
  id              UUID PRIMARY KEY,
  aggregate_type  TEXT NOT NULL,
  aggregate_id    TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'Unknown',
  event           JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE outbox ADD COLUMN IF NOT EXISTS type TEXT;
UPDATE outbox SET type = COALESCE(event->>'type', 'Unknown') WHERE type IS NULL;
ALTER TABLE outbox ALTER COLUMN type SET DEFAULT 'Unknown';
UPDATE outbox SET type = 'Unknown' WHERE type IS NULL;
ALTER TABLE outbox ALTER COLUMN type SET NOT NULL;

CREATE INDEX IF NOT EXISTS outbox_created_at_idx ON outbox (created_at);
CREATE INDEX IF NOT EXISTS outbox_type_idx ON outbox (type);

-- INT-225 — durable fixture billed trade ids (AC-05 FixtureTradeSource).
-- Applied to every module DB; only settlement reads/writes this table.
CREATE TABLE IF NOT EXISTS fixture_billed_trades (
  trade_id   TEXT PRIMARY KEY,
  marked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- INT-214 — publication for Debezium pgoutput (module role owns the table).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'dbz_outbox') THEN
    CREATE PUBLICATION dbz_outbox FOR TABLE outbox;
  END IF;
END
$$;
