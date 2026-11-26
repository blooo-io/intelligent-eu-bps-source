# Cluster money-path evidence — INT-459

**run_path: stripe-test** on `k8s-intelligent-eu-dev` / `int-apps` with `PSP_PROVIDER=stripe`.

| Scenario | Result |
|---|---|
| S4 KYC / Connect | Live Connect Express accounts (e.g. `acct_1Ug5eqFNmC6Gh1He`) |
| S7 Billing | Run `484e07c2-c984-4e93-afcb-e5c07ffff779` → 2 Open invoices via NATS |
| S8 Pay | `succeeded` + Stripe PaymentIntent / Charge on Connect accounts |
| S10 Payout | HTTP 409 `nothing_to_pay_out` (Connect balance not ready yet) |

Operator path: `scripts/stripe-fresh-billing-run.mjs`, then `POST /internal/v1/payments:start`.

**INT-460 fix verified:** after deploying the PaymentStatusListener unwrap, re-calling `payments:start` moved both invoices to **Paid** (`s08-pay-after-int460/`).
