# Cluster money-path evidence — INT-459 / INT-460 / INT-461

**run_path: stripe-test** on `k8s-intelligent-eu-dev` / `int-apps` with `PSP_PROVIDER=stripe`.

| Scenario | Result |
|---|---|
| S4 KYC / Connect | Live Connect Express accounts (e.g. `acct_1Ug5eqFNmC6Gh1He`) |
| S7 Billing | Run → Open invoices via NATS |
| S8 Pay | `succeeded` + Stripe PaymentIntent / Charge; invoices **Paid** after INT-460 unwrap (`s08-pay-after-int460/`) |
| S9 Failure | Decline attach `pm_card_chargeDeclined` → payment ends `failed` (`s09-failure/`). Reminder was **404** on notification `/reminders`; INT-461 routes REQ-061 to AC-06 `POST …/invoices/{id}/reminders` and CI re-proves |
| S10 Payout | Live `po_*` after A2 Void cleanup + `tok_bypassPending` seed (`s10-payout-live/`) |

## Durable CI path (INT-461)

Do not rely on one-shot port-forward scripts for regression. After merge:

- Workflow: `.github/workflows/money-path-stripe-dev.yml`
- Driver: `scripts/stripe-fresh-billing-run.mjs` → `scripts/cluster-money-path-e2e.mjs`
- Doc: [`docs/testing/money-path-stripe-e2e-cd.md`](../../money-path-stripe-e2e-cd.md)
