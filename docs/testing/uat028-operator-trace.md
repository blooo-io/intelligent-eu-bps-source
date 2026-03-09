# UAT-028 operator trace seed (INT-196)

**Status:** packaging in progress. Connect `charges_enabled` is no longer the blocker (UAT-015 Pass / INT-195). Remaining gap: run the settlement → invoice bridge on `dev`, then create a payment and open it as `uat-operator`.

## Why a bridge?

AC-05 writes `SettlementCompleted` / `BillingRunCompleted` to the outbox. AC-06 `createFromSettlement` exists but is not yet driven by a NATS consumer on the cluster. INT-196 exposes:

- `GET /internal/v1/billing-runs/{runId}` (settlement) — settlementIds for a run
- `POST /internal/v1/invoices:from-settlement` (invoicing) — TD-2 invoice with `tradeIds` + `pairSettlementId`

## Operator script

```bash
kubectl -n int-apps port-forward svc/settlement 18085:8080 &
kubectl -n int-apps port-forward svc/invoicing 18086:8080 &
SETTLEMENT_URL=http://127.0.0.1:18085 \
INVOICING_URL=http://127.0.0.1:18086 \
node scripts/uat028-seed-billing-trace.mjs
```

Uses mock S1 community `c0ffee00-1234-4abc-8def-0123456789ab` (FixtureTradeSource). Prefer `type=early` so amounts under the €5 threshold still invoice.

## Trace path (REQ-028)

1. Note `invoiceId`, `tradeIds`, `pairSettlementId` from the script output.
2. `GET /internal/v1/settlements/{pairSettlementId}` → `runId` (balance calculation run).
3. Public invoices UI shows `tradeIds` on the invoice detail (AC-01).
4. Pay via `POST /v1/invoices/{invoiceId}/payments` once consumer PM + producer Connect are ready (INT-195).

## Follow-ups

- Align mock S1 participant IDs with INT-194 UAT Keycloak seeds (or seed fixture actors into AC-03).
- Wire outbox → Debezium → NATS → AC-06 consumer so the bridge script is no longer required.
