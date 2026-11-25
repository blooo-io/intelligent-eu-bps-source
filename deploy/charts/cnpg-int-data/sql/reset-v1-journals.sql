-- A10.6 / Task 1.21 — one-shot truncate of V1 journals before the two-level model.
-- Applied by the optional PostSync Job when resetV1Journals.enabled=true.
-- BR-13 — restart append-only history; never rewrite past rows in place.
-- Each statement targets one module database (Job sets PGDATABASE / -d).

-- settlement
TRUNCATE settlement_settlements, settlement_runs, settlement_carry, fixture_billed_trades, outbox, processed_events;

-- invoicing
TRUNCATE invoices, statements, outbox, processed_events;

-- payments (also drop the obsolete connected_customers table from pre-WS1)
TRUNCATE payments, payouts, payment_accounts, outbox, processed_events;
DROP TABLE IF EXISTS connected_customers;

-- reporting / publication (CDC outbox only)
TRUNCATE outbox, processed_events;
