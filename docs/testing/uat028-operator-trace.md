# UAT-028 operator trace seed (INT-196…200)

**Status:** Pass on `dev` (2026-10-18 / INT-200). Invoice lineage + succeeded payment seeded; operator can open the invoice and see originating trade id(s), then follow `pairSettlementId` → billing `runId`.

## Why a bridge?

AC-05 writes `SettlementCompleted` / `BillingRunCompleted` to the outbox. INT-223 wires AC-06 to JetStream `SettlementCompleted` (hydrate via GetPairSettlement → `createFromSettlement`). The HTTP bridge remains for operator / seed when events are not replayed. INT-196 exposes:

- `GET /internal/v1/billing-runs/{runId}` (settlement) — settlementIds for a run
- `POST /internal/v1/invoices:from-settlement` (invoicing) — TD-2 invoice with `tradeIds` + `pairSettlementId`
- INT-197: optional `producerStripeAccountId` on the bridge body
- INT-198: Connect customer email for `send_invoice`

## Operator script

```bash
kubectl -n int-apps port-forward svc/settlement 18085:8080 &
kubectl -n int-apps port-forward svc/invoicing 18086:8080 &
# Fresh settlement pod: FixtureTradeSource marks trades billed in-memory after the first StartRun.
SETTLEMENT_URL=http://127.0.0.1:18085 \
INVOICING_URL=http://127.0.0.1:18086 \
PRODUCER_STRIPE_ACCOUNT_ID=acct_… \
node scripts/uat028-seed-billing-trace.mjs
```

Uses mock S1 community `c0ffee00-1234-4abc-8def-0123456789ab` (FixtureTradeSource). Prefer `type=early` so amounts under the €5 threshold still invoice.

`PRODUCER_STRIPE_ACCOUNT_ID` (INT-197) must be a Connect account with `charges_enabled` (UAT-015). Without it AC-06 synthesises `acct_test_*` and Stripe rejects invoice creation.

## Trace path (REQ-028)

1. Note `invoiceId`, `tradeIds`, `pairSettlementId` from the script output.
2. `GET /internal/v1/settlements/{pairSettlementId}` → `runId` (balance calculation run).
3. Public invoices UI shows `tradeIds` on the invoice detail (AC-01).
4. Pay via `POST /v1/invoices/{invoiceId}/payments` with a consumer PaymentMethod attached (Stripe test `tok_visa` → `pm_…`).

## Dev evidence (INT-200)

| Step | Id |
|---|---|
| Billing run | `5eb2839b-b2b8-4537-9b88-f71ff35f8e58` |
| Pair settlement | `c1ac7be6-ba82-46cd-bdb1-6e2fd0ea7c87` |
| Trade | `0x8f3a1c2b4d5e6f708192a3b4c5d6e7f8` |
| Invoice | `eaa02b1c-4f64-4634-a19a-50bdb3fdcd16` |
| Payment | `06eb11a5-d5ad-4a35-b11f-15b94ba676ae` (succeeded, EUR 2.00) |
| Connect account | `acct_1URyv9FGX8DfzG09` |

## Follow-ups

- Align mock S1 participant IDs with INT-194 UAT Keycloak seeds (or seed fixture actors into AC-03).
- INT-223: AC-06 JetStream consumer is live on `dev`; prefer event path for new billing runs. Bridge script remains for deterministic UAT re-seed.
