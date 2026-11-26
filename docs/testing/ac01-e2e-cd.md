# AC-01 continuous verification — superseded (INT-455 / INT-462)

The Playwright post-deploy workflow **`e2e-dev`** was removed with the public `/v1` reference client (INT-455). Do not revive it for D5.5 evidence.

## What replaced it

| Path | Workflow / driver | Label |
|---|---|---|
| EWDS Mock CGW (S1 inject + S13) | `ewds-e2e-dev` | `run_path: mock` |
| Stripe money-path S8/S9/S10 | `money-path-stripe-dev` + `scripts/cluster-money-path-e2e.mjs` | `run_path: stripe-test` |

Details: [`ewds-project-path-e2e.md`](ewds-project-path-e2e.md), [`money-path-stripe-e2e-cd.md`](money-path-stripe-e2e-cd.md).

## Historical note

Before INT-455, `supply-chain` → roll `:develop` → Playwright against `https://app.dev.…` proved AC-01 chrome and a Stripe pay journey. That stack is gone; portal UX is validated via manual / demo workbook paths, not CI Playwright.
