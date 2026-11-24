# D5.5 source realignment — progress log

**Parent Jira:** [INT-422](https://blooo-io.atlassian.net/browse/INT-422)
**Baseline:** `develop` @ `6a24cc3`
**Started:** 2026-11-24 (Europe/Paris)

## Precedence applied
- Plan master section (A1–A10, A7-bis, A8-live, B1–B11) overrides AGENTS.md "producer is the bank" early settlement, TP-7 Stripe-master-of-invoices, A22 all-virtual, AD-7/TP-8 "project UI uses the public API".
- Project UI (R2M) = EWDS records + command channel only (A7); `/v1` serves `apps/web` only.

## Day-1 contract plan (files to change)
| Task | Files |
|---|---|
| 1.1 early settlement removed | `contracts/openapi/public.v1.yaml`, `components/schemas.yaml`, `internal/settlement.v1.yaml`, `asyncapi/settlement.v1.yaml`, `asyncapi/invoicing.v1.yaml`, EWDS `billingInvoice` schemas ×2, `deploy/.../routes.yaml`, `scripts/billing-model-contracts.test.mjs`, web public-operations |
| 1.5 statements | public + internal invoicing OpenAPI, asyncapi invoicing, schemas |
| 1.10 payouts | public + internal payments/participants, asyncapi payments, webhooks, schemas, routes |
| 2.1–2.2 | invoice/tariff/notification contracts |
| 3.1 | KYC / Identity contracts |
| 4.1–4.3 | EWDS record + command channel schemas, internal ops |
| 5.1 | PSP-neutral + KPI contracts |

## Task groups
| Group | Jira | Status | PR | Notes |
|---|---|---|---|---|
| Day 1 contracts (1.1, 1.5, 1.10, 2.1, 2.2, 3.1, 4.1–4.3, 5.1) | INT-423 | in progress | — | |

## Decisions / deviations
| When | What | Why |
|---|---|---|
| 2026-11-24 | Branch `cursor/feature-int-423-day1-contracts-5f1c` (cloud naming) instead of `feature/INT-423-…` | Cloud agent branch template; INT-423 kept in title/commits for Jira |
| 2026-11-24 | Confirmed A7: R2M never calls `/v1` directly | Overrides prior AGENTS/REQ-052 interpretation |

## Externally blocked
_(none yet)_

## UAT re-runs
_(none yet)_
