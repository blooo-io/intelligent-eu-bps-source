# V1 release notes (INT-95)

**Deliverable:** D5.5 — Billing & Payment Service V1  
**Source tag:** `v1.0.1` ([SOURCE-RELEASE.md](SOURCE-RELEASE.md), INT-359). `v1.0.0` was the INT-92 freeze name and was never pushed.  
**Project:** Horizon Europe INTELLIGENT (GA 101160678), Task T5.6, led by Blooo  
**Licence:** Apache License 2.0 — see [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE)

## What ships

- Peer-to-peer self-billing invoices (producer is the bank): netting, threshold, carry-forward, early settlement (BR-01…BR-13).
- NestJS modules AC-03…AC-14, Refine reference web app (AC-01), mock suite (AC-15).
- Stripe **test mode** Connect payments and webhooks.
- GitOps deploy to Scaleway `k8s-intelligent-eu-dev` (`dev` / `int`) and packaging for `demo`.
- OpenAPI / AsyncAPI contracts; EWDS invoice/payment schema validation via mocks.
- Observability (OpenTelemetry), secrets via OpenBao + External Secrets, Keycloak OIDC, APISIX gateway.

## Known limitations (V1)

| Area | Limitation |
|---|---|
| Billing mode | Every community is **virtual**; no live community settlement |
| Payments | **Stripe test mode only** — no live charges or bank payouts in production sense |
| Market / data space / FX | GSY DEX, EWDS Client Gateway and ECB are **mocked** (assumption A32) |
| Crypto / AMM / stablecoin | Out of D5.5 scope (deferred to D5.10) |
| Grid fees / taxes on P2P invoices | Not on P2P invoices (A20) |
| Acceptance | **62 Pass / 0 Blocked** in-scope UATs (INT-204, 2026-10-18). Remaining partner optimisations: pilot SLA number (NFR-008), onboarding step-count (NFR-016) — see [`docs/testing/v1-uat-package.md`](../testing/v1-uat-package.md) |
| Partner IdP | V1 = single project IdP only (REQ-034 / REQ-037 and UAT-044 / UAT-047 out of scope, INT-192). Config-only issuer path Pass on UAT-061 |
| Stripe Connect | Producers onboard in Stripe's embedded Account onboarding component; the producer pays Stripe fees and bears disputes, the platform absorbs nothing (INT-362). Direct charges on the producer account (INT-355). Operator test fixtures still use Account Tokens + test KYC tokens (INT-191 / INT-195). Cards only in V1 (INT-361) |
| Billing period | Quarterly. The FX date is the period end (INT-353). Carry-forward is signed (INT-351). Money uses exact decimal arithmetic (INT-352). Each trade is an invoice line (INT-354) |
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
