# UAT-028 operator trace seed (INT-196…200 / INT-228)

**Status:** Pass on `dev` (2026-10-18 / INT-200). Invoice lineage + succeeded payment seeded; operator can open the invoice and see originating trade id(s), then follow `pairSettlementId` → billing `runId`.

## Why a bridge?

AC-05 writes `SettlementCompleted` / `BillingRunCompleted` to the outbox. INT-223 wires AC-06 to JetStream `SettlementCompleted` (hydrate via GetPairSettlement → `createFromSettlement`). The HTTP bridge remains for operator / seed when events are not replayed. INT-196 / INT-238 expose:

- `GET /internal/v1/billing-runs/{runId}` (settlement) — settlementIds for a run
- `GET /internal/v1/invoices:by-settlement/{settlementId}` (invoicing) — poll NATS-created invoices
- `POST /internal/v1/invoices:from-settlement` (invoicing) — operator bridge only
- INT-197: optional `producerStripeAccountId` on the bridge body
- INT-198: Connect customer email for `send_invoice`
- INT-228: AC-06 resolves Connect ids from AC-07; **never invents `acct_test_*` when Stripe is live**

## Preferred: fresh Stripe entities + NATS proof (INT-228 / INT-238)

Creates **new** Connect Custom accounts in Stripe test mode, binds them in AC-07, resets fixture billed trades, starts an early billing run, then **polls** `invoices:by-settlement` until AC-06's NATS consumer has created Customers + Invoices (never calls the HTTP bridge).

```bash
kubectl -n int-apps port-forward svc/payments 18087:8080 &
kubectl -n int-apps port-forward svc/settlement 18085:8080 &
kubectl -n int-apps port-forward svc/invoicing 18086:8080 &
PAYMENTS_URL=http://127.0.0.1:18087 \
SETTLEMENT_URL=http://127.0.0.1:18085 \
INVOICING_URL=http://127.0.0.1:18086 \
node scripts/stripe-fresh-billing-run.mjs
```

Uses S1 community `c0ffee00-1234-4abc-8def-0123456789ab` (INT-236 Keycloak users `s1-*` bound in AC-03). Prefer `type=early` so amounts under the €5 threshold still invoice.

## Legacy bridge (fixed Connect id)

```bash
kubectl -n int-apps port-forward svc/settlement 18085:8080 &
kubectl -n int-apps port-forward svc/invoicing 18086:8080 &
SETTLEMENT_URL=http://127.0.0.1:18085 \
INVOICING_URL=http://127.0.0.1:18086 \
PRODUCER_STRIPE_ACCOUNT_ID=acct_… \
node scripts/uat028-seed-billing-trace.mjs
```

`PRODUCER_STRIPE_ACCOUNT_ID` (INT-197) must be a Connect account with `charges_enabled` (UAT-015). Prefer `stripe-fresh-billing-run.mjs` so each run leaves new Dashboard artifacts instead of reusing a single account.

## Trace path (REQ-028)

1. Note `invoiceId`, `tradeIds`, `pairSettlementId` from the script output (or invoicing logs after NATS).
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

- INT-236: S1 Keycloak users (`s1-consumer` / `s1-producer-a` / `s1-producer-b`) + AC-03 `idpUserId` bind — one identity chain with market trades.
- INT-237: AC-04 `HttpPartyResolver` when `PARTICIPANTS_INTERNAL_URL` is set.
- INT-223 / INT-238: prefer NATS event path + `stripe-fresh-billing-run.mjs` (poll `by-settlement`); keep HTTP bridge as operator fallback.
