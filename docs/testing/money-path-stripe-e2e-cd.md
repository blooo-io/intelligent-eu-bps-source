# Money-path Stripe E2E on destinDev (INT-461)

**run_path: stripe-test** — not Mock CGW. Sibling of [`ewds-project-path-e2e.md`](ewds-project-path-e2e.md) / `ewds-e2e-dev`.

## What it proves

| Scenario | Call path | Stripe fixture |
|---|---|---|
| S8 Pay | `payment-methods:attach` + `payments:start` → invoice **Paid** | `pm_card_visa` |
| S9 Failure + reminder | decline PM → payment **failed** → `POST …/invoices/{id}/reminders` | `pm_card_chargeDeclined` |
| S10 Payout | Void leftover Open (A2) → seed available balance → `payouts:request` | `tok_bypassPending` + live `po_*` |

## Workflow

`.github/workflows/money-path-stripe-dev.yml` (`money-path-stripe-dev`):

| Trigger | When |
|---|---|
| `workflow_run` | After **supply-chain** succeeds on `develop` |
| `workflow_dispatch` | Operator manual run |
| `repository_dispatch` type `money-path-stripe-dev` | Future Argo hook |

Requires GitHub Environment `dev` secret `KUBECONFIG_INTELLIGENT_EU_DEV`. Stripe test key is read from the cluster `payments` secret (OpenBao-synced) — no extra GitHub secret.

## Driver scripts

1. `scripts/stripe-fresh-billing-run.mjs` — fresh Connect accounts + Open invoices → `E2E_FRESH_INVOICE_IDS`.
2. `scripts/cluster-money-path-e2e.mjs` — S8 → S9 → S10; optional `EVIDENCE_DIR` packs (`input.json` / `output.json`).

## Evidence

CI uploads artifact `money-path-stripe-evidence`. Operator dumps under `docs/testing/evidence/<date>/cluster-money-path/` when attaching to a release note.
