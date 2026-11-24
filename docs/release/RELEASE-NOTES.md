# V1 release notes (INT-95)

**Deliverable:** D5.5 — Billing & Payment Service V1  
**Source tag:** `v1.1.6` (INT-421), after `v1.1.5` (INT-417), `v1.1.4` (INT-415), `v1.1.3` (INT-412), `v1.1.2` (INT-409), `v1.1.1` (INT-400), `v1.1.0` (INT-397) and `v1.0.1` ([SOURCE-RELEASE.md](SOURCE-RELEASE.md), INT-359). `v1.0.0` was the INT-92 freeze name and was never pushed.  
**Project:** Horizon Europe INTELLIGENT (GA 101160678), Task T5.6, led by Blooo  
**Licence:** Apache License 2.0 — see [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE)

## What ships

- Two-level billing (BR-01…BR-15): monthly participant statements (Level 1) plus self-billing legal invoices per consumer→producer pair (Level 2), with netting, per-pair threshold and carry-forward. REQ-057 settle-now is deprecated and removed.
- In-house self-billing PDFs (`pdf-lib`) with gapless legal numbers `SB-<producer8>-<seq6>` per producer; Stripe Invoicing removed (A6).
- Payouts from the producer's Stripe Connect account to their bank (manual schedule; optional `autoPayout`).
- KYC for every participant role (Connect onboarding target) and Stripe Identity for community managers; `kycVerified` gates statements, invoices, payments and payouts.
- NestJS modules AC-03…AC-14, Refine reference web app (AC-01), mock suite (AC-15).
- Stripe test mode Connect payments and webhooks; live keys selectable per community when enabled (REQ-043).
- EWDS Client Gateway adapters (`@intelligent/ewds-client`) for the five billing records (`billingStatement`, `billingInvoice`, `billingPayment`, `billingPayout`, `billingKycStatus`) and the billing command channel; mock default until EWAG grants topics/roles.
- Live or virtual billing mode per community (Greenvolt first live community).
- GitOps deploy to Scaleway `k8s-intelligent-eu-dev` (`dev` / `int`) and packaging for `demo`.
- OpenAPI / AsyncAPI contracts; EWDS invoice/payment schema validation via mocks.
- Observability (OpenTelemetry), secrets via OpenBao + External Secrets, Keycloak OIDC, APISIX gateway.
- Public docs site publishes the five architecture views (plus EWDS Client Gateway note) at `/architecture/`.

## Changes since v1.1.6

v6.1 source realignment (INT-422 parent; day closeouts INT-423…INT-430):

- **INT-423** — Day 1: contracts for the two-level model, statements, payouts, KYC/Identity, EWDS records + command channel, `@intelligent/ewds-client`, public hygiene, FX precision.
- **INT-424** — Day 2: PSP-neutral ports; settle-now / REQ-057 removal from APIs, UI and mock scenarios.
- **INT-425** — Day 3: CollectPort pay + webhook path; participant statements.
- **INT-426** — Day 4: producer payouts (manual schedule, withdrawal, `autoPayout`); Task 1.13 consumer Connect deferred.
- **INT-427** — Day 5: reporting + KPI fields (initiated/settled, PSP fee, per-method).
- **INT-428** — WS2 catch-up: billing-owned PDF / `SB-…` numbers, reminders (UAT-078 Pass), tariff amount mapping on publication.
- **INT-429** — Day 5b: GDPR DSAR export, real IdP/PSP erasure adapters, Identity wizard step, EWDS invoice mapper + deploy/docs for adapter flags.
- **INT-430** — Day 6: release notes, UAT re-run packaging, D5.5 report and tag cut (in progress; package version remains `1.1.6` until the cut).

## Changes since v1.1.5

- Invoicing (INT-428 / A6): **Stripe Invoicing removed**. Billing owns self-billing PDFs (`pdf-lib`) and gapless legal numbers `SB-<producer8>-<seq6>` per producer; AC-11 e-mails the PDF on issue. Payment reminders: manager action + scheduled job (`SendReminders`); missing-payment alert path tracked under UAT-078 / REQ-061.
- Dependencies: bump vitest / `@vitest/coverage-v8` / `@vitest/mocker` to 4.1.12 and override remaining transitive advisories (`minimatch`, `glob`, `uuid`, `ajv`, `@babel/core`, `fast-xml-parser`) so `pnpm audit` is clean (INT-418).
- Security: close CodeQL High alerts — URL component checks in docs OpenAPI server assertion; no clear-text password/credential fields in Sonar/OpenBao operator CLI logs (INT-419).
- Supply-chain: strip vitest from the `cd-smoke` Docker `npm install` so image builds do not hit the npm arborist `edgesOut` crash under vitest 4 (INT-420).

## Changes since v1.1.4

- Dependencies: `pnpm.overrides` force patched transitive advisories (`jsonpath-plus`, `simple-git` / `@simple-git/argv-parser`, `lodash`, `@faker-js/faker`, `fast-uri`, `qs`, `tinypool@2.1.2`, `vite@6.4.6`) while holding vitest at 3.2.7 (INT-416).
- Supply-chain: suppress Trivy UNKNOWN `CVE-2026-84786` on distroless `libssl3t64` so release images can publish (INT-416); `v1.1.4` image job failed before this ignore.

## Changes since v1.1.3

- Docs site: sync `docs/architecture/` into VitePress at build time; Architecture nav and home CTA on https://intelligent.docs.blooo.dev/architecture/ (INT-413).
- Supply-chain: suppress Trivy UNKNOWN `CVE-2026-95690` on distroless `libssl3t64` (same pattern as INT-402) so `:develop` / release images can publish (INT-415).

## Changes since v1.1.2

- Release train: `ci` → `supply-chain` → `stable-release` → `release` (INT-411); patch `v1.1.3` ships the `.trivyignore` for distroless `libc6` UNKNOWN CVEs so release images can publish (INT-412).
- AC-01: app `tsc` no longer typechecks Vitest specs; money-path Stripe helpers stay Node-free (INT-412).
- Hold `vitepress-openapi` at 0.2.12 (0.2.14+ breaks the docs SSR build) and pin vitest / `@vitest/coverage-v8` at 3.2.7 (vitest 5 drops branch coverage below 80% across modules) (INT-412).
- Dependabot auto-merge only squash-merges after a successful `ci` run on the PR (INT-412).
- `stable-release` dispatches `release` after cutting the tag (`GITHUB_TOKEN` tag pushes do not start workflows) (INT-412).

## Changes since v1.1.1

- Public docs host on `intelligent.docs.blooo.dev` with password-grant token helper for Try it out (INT-401, INT-403, INT-404).
- APISIX CORS allows the docs origin so the playground can call the sample gateway (INT-405).
- Docs OpenAPI prepare bundles external `$ref`s and pins vitepress-openapi so Try it out attaches `Authorization: Bearer …` (INT-406…INT-408).
- CI: suppress Trivy UNKNOWN findings for `libssl3t64` (INT-402).

## Changes since v1.1.0

- Demo booklet: each Horizon Energy scenario keeps the form walkthrough and adds the same steps as a direct `/v1` call, with the JSON filled from the demo data (INT-398).
- Screenshots: every signed-in screen shows the header API link, and each persona has a capture of the `/api` console. PDF regenerated (INT-399).

## Changes since v1.0.1


- Reference web app: an API console at `/api` lists every public operation for any signed-in role, and is linked from the header (INT-387).
- Invoices: the PDF is returned as bytes, not a Stripe redirect (INT-389). Payment readiness and onboarding unblocked on the manual screens (INT-390, INT-391).
- Payments: a member pays an invoice that names them by IdP subject (INT-395). Start fails closed when a saved card cannot sync to Ready (INT-390).
- Gateway: Stripe.js is allowed in the app Content-Security-Policy (INT-388).
- Test: an authenticated public API e2e suite runs on the deployed stack and fails unless every public operation is covered (INT-394).
- Platform: Argo CD reports `platform-kyverno` Synced, with labels and annotations rendered on the Kyverno policy CRDs (INT-396). NATS, CNPG and Kyverno fixes from INT-377 to INT-384.

## GDPR retention (REQ-011 / REQ-013)

| Data class | Default | Config | Notes |
|---|---|---|---|
| Personal cache (AC-12 projection) | 365 days after relationship end | `RETENTION_PERSONAL_DAYS` | Anonymized by ApplyRetention; no names/emails stored |
| Invoice identifiers / legal archives | 10 years | `RETENTION_INVOICE_YEARS` (6–10) | Kept after erasure; `retainedUntil` = 31 Dec of issue year + years |
| KYC audit log | 5 years | `RETENTION_KYC_LOG_YEARS` (≥ 5) | Identifiers and status only |

## Stripe live-mode erasure limit (REQ-013 / B5)

In **live** mode, AC-07 erase-at-psp does **not** delete the Connect account. Stripe keeps KYC data as an independent controller under AML law. The outcome reported to AC-12 is `retained_by_psp` with reason `aml_legal_obligation`. Test mode still deletes Connect accounts and customers.

## Known limitations (V1)

| Area | Limitation |
|---|---|
| Billing mode | **Live per community** (Greenvolt first); others virtual (REQ-043). A22 "all virtual" withdrawn |
| Payments | **Stripe test** by default; live keys only where a community is enabled for live (REQ-043) |
| Market / data space / FX | Real CG adapters exist and are selected by env; **mock** remains the default until EWAG grants topics/roles. UATs on the mock path are labelled (`Pass on mock path`). ECB stays mocked (A32) |
| Crypto / AMM / stablecoin | Out of D5.5 scope (deferred to D5.10) |
| Grid fee / levy / tax | **0 + mention** on the invoice until a DSO tariff is published (REQ-004 / REQ-007). Publication maps fee components when present (INT-428); full UAT-004 mock-tariff Pass pending tariff billing + WS4 |
| EV charging | Out of scope (A10.4) |
| DID / VC identity | Not in V1 (REQ-062 → D5.10); OIDC RP stays Keycloak-based (A9) |
| Stripe data residency | See [`05-physical-architecture.md`](../architecture/05-physical-architecture.md) §4.1 (third-party processor note) |
| Invoicing | Billing-owned PDF and `SB-…` legal numbers (A6); Stripe Invoicing removed (INT-428). Reminders: UAT-078 Pass on mock path |
| Acceptance | **63 Pass / 0 Blocked / 0 Fail** in-scope (61 Pass + 2 Pass on mock path). Historical INT-204 baseline was 62 in-scope Pass before UAT-078. v6.1 re-run list: [`v6.1-rerun.md`](../testing/v6.1-rerun.md). Partner optimisations: pilot SLA number (NFR-008), onboarding step-count (NFR-016) — see [`docs/testing/v1-uat-package.md`](../testing/v1-uat-package.md) |
| Partner IdP | V1 = single project IdP only (REQ-034 / REQ-037 and UAT-044 / UAT-047 `scope_d55: out`, INT-192). Config-only issuer path Pass on UAT-061 |
| Stripe Connect | Producers/prosumers onboard via embedded Connect; consumers still use Elements card setup only — **Task 1.13 (consumer Connect for every role) deferred** (INT-426). Direct charges on the producer account (INT-355). Cards + SEPA in the model; operator test fixtures still use Account Tokens + test KYC tokens (INT-191 / INT-195) |
| KYC backend (WS3) | Contracts and wizard copy exist; unfinished backend Tasks **3.2–3.11** and **3.13–3.17** (KycService / Identity for managers, shared readiness, ActorSourcePort, BillingModeResolver, live-mode guards and PSP key selection). GDPR Tasks 3.18–3.24 shipped (INT-429) |
| EWDS actor / command transport (WS4) | Record schemas, `@intelligent/ewds-client` and publication mappers shipped; **Actor intake transport**, command dispatcher/poller, erasure/tariff EWDS transports (Tasks 4.13–4.18) still missing — `ERASURE_REQUEST_SOURCE=ewds` fails closed until wired |
| Billing period | **Monthly** by default, quarterly allowed (REQ-006); FX date = period end (INT-353). Carry-forward is signed (INT-351). Money uses exact decimal arithmetic (INT-352). Each trade is an invoice line (INT-354) |
| Persistence | Settlement, invoices, payment attempts and the participant registry commit with the outbox in PostgreSQL when `DATABASE_URL` is set (INT-356, BR-13). CI without that variable stays in memory |
| Database backups | CloudNativePG WAL and base backups are packaged and **left disabled** (`backup.enabled: false`) until the buckets and OpenBao paths exist (INT-358) |

## Licensing

- Project source: **Apache-2.0**.
- Third-party dependencies we link: **MIT or Apache-2.0 only** (TP-2). AGPL/GPL/SSPL/BUSL are refused for code we embed.
- Accepted exceptions, each a **separate unmodified service** that Billing never links (TD-1 / TD-9): **OpenBao** (MPL-2.0), **SonarQube Community Build** (INT-292), **DDHub Client Gateway** images (GPL-3.0, INT-308). See [`04-technical-architecture.md`](../architecture/04-technical-architecture.md) §4.
- Do not redistribute Stripe secret keys or OpenBao root tokens; they are never committed.

## Documentation map

| Topic | Path |
|---|---|
| Deploy / configure | [deployment.md](deployment.md) |
| Integrate APIs | [integration-api.md](integration-api.md) |
| Requirements & UAT | `docs/requirements/` |
| Architecture | `docs/architecture/` |
| Testing evidence | `docs/testing/` |

## How to verify a build

1. CI green on `develop` (contracts, charts, tests with ≥80% coverage per module).
2. Argo Applications Healthy for `dev-*` modules and platform.
3. Smoke: app `/health` 200, API `/v1/me` 401 without token, auth realm reachable.
