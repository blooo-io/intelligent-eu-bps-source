# Cluster money-path evidence — INT-459 / INT-460 / INT-461 / INT-462

**run_path: stripe-test** on `k8s-intelligent-eu-dev` / `int-apps` with `PSP_PROVIDER=stripe`.

| Scenario | Result |
|---|---|
| S4 KYC / Connect | Live Connect Express accounts |
| S7 Billing | Run → Open invoices via NATS |
| S8 Pay | CI green: invoice **Paid** (`s08-pay-ci/`) |
| S9 Failure + reminder | CI green: payment **failed** + `reminderCount: 1` (`s09-failure-ci/`) |
| S10 Payout | CI green: `in_transit` + Stripe `po_*` paid (`s10-payout-ci/`) |

## Durable CI path

- Workflow: `.github/workflows/money-path-stripe-dev.yml`
- Driver: `scripts/stripe-fresh-billing-run.mjs` → `scripts/cluster-money-path-e2e.mjs`
- Doc: [`docs/testing/money-path-stripe-e2e-cd.md`](../../money-path-stripe-e2e-cd.md)
- First green run: https://github.com/blooo-io/intelligent-eu-bps-source/actions/runs/45873655357 (26 Nov 2026, ~19:17 Europe/Paris)

Manual packs under `s08-pay/`, `s09-failure/`, `s10-payout-live/` are historical; **`*-ci/`** are the regression source of truth.
