# V1 release notes (INT-95)

**Deliverable:** D5.5 — Billing & Payment Service V1  
**Source tag:** `v1.0.0` ([SOURCE-RELEASE.md](SOURCE-RELEASE.md), INT-92)  
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
| Acceptance | **55 Pass / 9 Blocked** in-scope UATs (INT-80, 2026-10-18). Blockers: Stripe Connect platform profile, second IdP, pilot UX/perf — see [`docs/testing/v1-uat-package.md`](../testing/v1-uat-package.md) |
| Partner IdP | Multi-issuer live swap not provisioned on `dev` (config-only path Pass on UAT-061) |
| Stripe Connect | Test adapters live (INT-189); Dashboard platform-profile acceptance still required before Connect accounts / destination payouts |

## Licensing

- Project source: **Apache-2.0**.
- Third-party dependencies: **MIT or Apache-2.0 only** (TP-2). AGPL/GPL/SSPL/BUSL are refused.
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
