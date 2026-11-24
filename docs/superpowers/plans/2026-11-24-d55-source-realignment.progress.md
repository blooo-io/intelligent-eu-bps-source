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
| Day 1 contracts + ewds-client + hygiene + FX | INT-423 | Done | [#190](https://github.com/blooo-io/intelligent-eu-bps-source/pull/190) squash-merged `bd266af` | Tasks 1.1, 1.5, 1.10, 2.1–2.3, 3.1, 4.1–4.7, 5.1, 6.1–6.2 |
| Day 2 PSP ports + early-settlement removal | INT-424 | Done | [#191](https://github.com/blooo-io/intelligent-eu-bps-source/pull/191) squash-merged `1d3373c` | Tasks 1.2–1.4 + 5.2–5.6 |
| Day 3 CollectPort pay + webhook + statements | INT-425 | Done | [#193](https://github.com/blooo-io/intelligent-eu-bps-source/pull/193) squash-merged `1c780df` | Tasks 1.6–1.9 + 5.7–5.8 |
| Day 4 payouts | INT-426 | In progress | [#194](https://github.com/blooo-io/intelligent-eu-bps-source/pull/194) | 1.11 + 1.15 done (`c90e8a4`); 1.12–1.14 / 1.16–1.18 in flight |

## Decisions / deviations
| When | What | Why |
|---|---|---|
| 2026-11-24 | Branch `cursor/feature-int-423-day1-contracts-5f1c` (cloud naming) instead of `feature/INT-423-…` | Cloud agent branch template; INT-423 kept in title/commits for Jira |
| 2026-11-24 | Confirmed A7: R2M never calls `/v1` directly | Overrides prior AGENTS/REQ-052 interpretation |
| 2026-11-24 | Pin `@intelligent/public-api-client` TypeScript to 5.9.3 | openapi-typescript peer; TS 7 breaks generate |
| 2026-11-24 | A7-bis command reply uses `handoff` PspHandoff (not `data.redirect`) | Master A7-bis overrides Task 4.2 hosted-only text |
| 2026-11-24 | CGW OpenAPI snapshot is a stub | No KUBECONFIG/cluster for live `/docs-json` capture |
| 2026-11-24 | Keep `docs/superpowers/plans/` (defer full 6.3 folder removal) | Kickoff stores plan+progress there; 6.3 only drops superseded specs |
| 2026-11-24 | Scrubbed `Q-031` from REQ-003 for hygiene HEAD-clean | Unblocks 6.2 before vault sync 6.6 |

## Externally blocked
| Item | Impact | Next |
|---|---|---|
| Live CGW Swagger capture (Task 4.4) | Stub snapshot in `packages/ewds-client/test/` | Port-forward `ddhub-client-gateway` when kubeconfig available |

## UAT re-runs
_(none yet)_
