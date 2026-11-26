# AC-01 browser E2E — superseded (INT-455 / INT-462)

Playwright suites under `apps/web/e2e/` that targeted the public `/v1` reference client and workflow `e2e-dev` were withdrawn with INT-455.

## Current regression paths

| Concern | Where |
|---|---|
| EWDS S1–S14 (in-process + Mock CGW cluster) | [`ewds-project-path-e2e.md`](ewds-project-path-e2e.md) |
| Stripe pay / fail+reminder / payout on destinDev | [`money-path-stripe-e2e-cd.md`](money-path-stripe-e2e-cd.md) |
| Portal demo / manual UX | [`cahier-de-tests-demo-intelligent-billing-and-payment.md`](./cahier-de-tests-demo-intelligent-billing-and-payment.md), [`manual-s1-portal-journey.md`](./manual-s1-portal-journey.md) |

Post-deploy CD notes that used to describe `e2e-dev`: [`ac01-e2e-cd.md`](ac01-e2e-cd.md).
