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
| Day 4 payouts | INT-426 | Done | [#194](https://github.com/blooo-io/intelligent-eu-bps-source/pull/194) squash-merged `7335a97` | 1.11–1.12/1.15–1.18; **1.13/1.14 deferred** |
| Day 5 reporting + KPIs | INT-427 | Done | [#195](https://github.com/blooo-io/intelligent-eu-bps-source/pull/195) squash-merged `1ff21f9` | 1.19–1.20 + 5.9–5.13 |
| WS2 catch-up invoicing | INT-428 | Done | [#196](https://github.com/blooo-io/intelligent-eu-bps-source/pull/196) squash-merged `8bc38bd` | 2.13–2.19 + 1.14; UAT-078 Pass |
| Day 5b GDPR + EWDS | INT-429 | Done | [#197](https://github.com/blooo-io/intelligent-eu-bps-source/pull/197) squash-merged `b5ee28b` | 3.12, 3.18–3.24, 4.12, 4.19–4.20 |
| Day 6 release closeout | INT-430 | Done | [#198](https://github.com/blooo-io/intelligent-eu-bps-source/pull/198) / [#201](https://github.com/blooo-io/intelligent-eu-bps-source/pull/201) | Tag [v1.2.0](https://github.com/blooo-io/intelligent-eu-bps-source/releases/tag/v1.2.0) @ `3675952` |
| WS3 KYC catch-up | INT-431 | Done | [#199](https://github.com/blooo-io/intelligent-eu-bps-source/pull/199) squash-merged `6e8dd7b` | 3.2–3.11, 3.13–3.17 |
| WS4 EWDS transport catch-up | INT-432 | Done | [#200](https://github.com/blooo-io/intelligent-eu-bps-source/pull/200) squash-merged `dd5b3dc` | 4.13–4.18 |
| Release train unblockers | INT-433…436 | Done | [#202](https://github.com/blooo-io/intelligent-eu-bps-source/pull/202)–[#205](https://github.com/blooo-io/intelligent-eu-bps-source/pull/205) | nodemailer · trivyignore · ewds-client Docker · participants mocks |
| Remaining closeout | INT-437 | Done | [#207](https://github.com/blooo-io/intelligent-eu-bps-source/pull/207) | 4.4 live CGW · 6.4–6.6 · 6.8–6.15 · UAT-074 deprecated |
| Dev evidence + crashloop | INT-438 | Done | [#210](https://github.com/blooo-io/intelligent-eu-bps-source/pull/210) | Probe all-green; OpenBao CGW seeded |
| INT-439 CGW clientId/poll + reply encrypt | INT-439 | Done | [#209](https://github.com/blooo-io/intelligent-eu-bps-source/pull/209)/[#211](https://github.com/blooo-io/intelligent-eu-bps-source/pull/211)/[#212](https://github.com/blooo-io/intelligent-eu-bps-source/pull/212) | CrashLoops cleared; channels empty → TOPIC bind needs EWAG |
| **Remediation v1.2.1 (audit ebed7e4)** | INT-440 | In progress | [#213](https://github.com/blooo-io/intelligent-eu-bps-source/pull/213) | Blockers 1–7 landed (repo D5.5 report + DEV-01..14); majors §2 + e2e + tag v1.2.1 remain |

## Honesty downgrade (INT-440 / audit V1–V4)
| Claimed Done | Reality | Action |
|---|---|---|
| WS2 PDF / UAT-050 Pass | Was stub; now pdf-lib renderer + stored docs | UAT-050 stays Not Run until re-run |
| UAT-053 Pass numbering | Numbering exists; PDF path real | UAT-053 stays Not Run until re-run |
| 4.12 five topics | Now statement/payout/kyc + invoice/payment | Done on branch |
| 4.8–4.11 A8-live adapters | MARKET/DATASPACE factories + EWDS adapters | Done on branch |
| Live mode | Throw removed; open-periods 409 guard | Done on branch |
| OpenBao CGW blocked | Stale — secrets Ready on probe | Cleared in Externally blocked |

## Decisions / deviations
| When | What | Why |
|---|---|---|
| 2026-11-24 | Branch `cursor/feature-int-423-day1-contracts-5f1c` (cloud naming) instead of `feature/INT-423-…` | Cloud agent branch template; INT-423 kept in title/commits for Jira |
| 2026-11-24 | Confirmed A7: R2M never calls `/v1` directly | Overrides prior AGENTS/REQ-052 interpretation |
| 2026-11-24 | Pin `@intelligent/public-api-client` TypeScript to 5.9.3 | openapi-typescript peer; TS 7 breaks generate |
| 2026-11-24 | A7-bis command reply uses `handoff` PspHandoff (not `data.redirect`) | Master A7-bis overrides Task 4.2 hosted-only text |
| 2026-11-24 | CGW OpenAPI snapshot was a stub (superseded INT-437) | Secret was `KUBECONFIG_INTELLIGENT_EU_DEV` (not `KUBECONFIG`); kubectl was missing in the agent image |
| 2026-11-25 | Live CGW `/docs-json` captured into `packages/ewds-client/test/cgw-openapi.snapshot.json` | Port-forward `svc/ddhub-client-gateway` (ns `ddhub`), image tag `intelligent-canary` |
| 2026-11-24 | Keep `docs/superpowers/plans/` (defer full 6.3 folder removal) | Kickoff stores plan+progress there; 6.3 only drops superseded specs |
| 2026-11-24 | Scrubbed `Q-031` from REQ-003 for hygiene HEAD-clean | Unblocks 6.2 before vault sync 6.6 |

## Externally blocked
| Item | Impact | Next |
|---|---|---|
| EWAG topiccreator / topic registration | Channels exist; `POST /topics` 403; messages `TOPIC::NOT_RELATED_TO_CHANNEL` | Send ontology-aligned schemas to Digital Spine (after INT-440 schema fix); they configure topics |
| R2M gateway DID allow-list unknown | Empty `EWDS_COMMAND_ALLOWED_DIDS` rejects all commands | Log; set when R2M provides DID |
| Live Stripe keys | Never in repo; live mode with test keys + mode guard | Keep test keys only |

## UAT re-runs
| When | What | Result |
|---|---|---|
| 2026-11-25 | Task 6.14 packaging on `v1.2.0` | All in-scope notes have `run_path`; **62 Pass / 0 Blocked** (27 mock-path). Live CGW UAT execution still pending EWAG grants. |
