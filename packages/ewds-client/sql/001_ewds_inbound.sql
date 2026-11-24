-- REQ-053 / UAT-069 — durable EWDS inbound cache (≤ 7 days, not system of record).
CREATE TABLE IF NOT EXISTS ewds_inbound_message (
  message_id text PRIMARY KEY,
  topic_name text NOT NULL,
  sender text NOT NULL,
  received_at timestamptz NOT NULL,
  payload text NULL,
  status text NOT NULL
);

CREATE INDEX IF NOT EXISTS ewds_inbound_message_received_at_idx
  ON ewds_inbound_message (received_at);