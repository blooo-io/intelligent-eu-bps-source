# INTELLIGENT — Billing & Payment Service

[![CI](https://github.com/blooo-io/intelligent-eu-bps-source/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/blooo-io/intelligent-eu-bps-source/actions/workflows/ci.yml?query=branch%3Adevelop)
[![Docs](https://github.com/blooo-io/intelligent-eu-bps-source/actions/workflows/docs.yml/badge.svg)](https://github.com/blooo-io/intelligent-eu-bps-source/actions/workflows/docs.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Docs site](https://img.shields.io/badge/docs-intelligent.docs.blooo.dev-1a4d3e)](https://intelligent.docs.blooo.dev/)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)](.nvmrc)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](docs/architecture/04-technical-architecture.md)
[![NestJS](https://img.shields.io/badge/NestJS-12-E0234E?logo=nestjs&logoColor=white)](docs/architecture/04-technical-architecture.md)
[![pnpm](https://img.shields.io/badge/pnpm-9-F69220?logo=pnpm&logoColor=white)](package.json)

**Quality (SonarQube Community — [live dashboard](https://sonar.intelligent-eu-bp.blooo.dev/dashboard?id=blooo-io_intelligent-eu-billing-and-payment))**

[![Quality Gate](https://img.shields.io/badge/Quality%20Gate-passed-brightgreen)](https://sonar.intelligent-eu-bp.blooo.dev/dashboard?id=blooo-io_intelligent-eu-billing-and-payment)
[![Coverage](https://img.shields.io/badge/coverage-91.7%25-brightgreen)](https://sonar.intelligent-eu-bp.blooo.dev/component_measures?id=blooo-io_intelligent-eu-billing-and-payment&metric=coverage)
[![Maintainability](https://img.shields.io/badge/Maintainability-A-brightgreen)](https://sonar.intelligent-eu-bp.blooo.dev/dashboard?id=blooo-io_intelligent-eu-billing-and-payment)
[![Reliability](https://img.shields.io/badge/Reliability-A-brightgreen)](https://sonar.intelligent-eu-bp.blooo.dev/dashboard?id=blooo-io_intelligent-eu-billing-and-payment)
[![Security](https://img.shields.io/badge/Security-A-brightgreen)](https://sonar.intelligent-eu-bp.blooo.dev/dashboard?id=blooo-io_intelligent-eu-billing-and-payment)
[![Code smells](https://img.shields.io/badge/code%20smells-0-brightgreen)](https://sonar.intelligent-eu-bp.blooo.dev/project/issues?id=blooo-io_intelligent-eu-billing-and-payment&resolved=false&types=CODE_SMELL)
[![Vitest floor](https://img.shields.io/badge/Vitest%20coverage%20floor-80%25-informational)](config/coverage-thresholds.json)

**Validation (D5.5 V1)**

[![UAT](https://img.shields.io/badge/UAT-64%2F64%20Pass-brightgreen)](docs/testing/v1-validation-summary.md)
[![Horizon Europe](https://img.shields.io/badge/Horizon%20Europe-GA%20101160678-003399)](https://cordis.europa.eu/project/id/101160678)
[![Deliverable](https://img.shields.io/badge/D5.5-T5.6-0B5FFF)](docs/release/RELEASE-NOTES.md)

Billing and payment service of the Horizon Europe project **INTELLIGENT** ([GA 101160678](https://cordis.europa.eu/project/id/101160678)). It covers **Task T5.6** and **Deliverable D5.5**. The software is published under **Apache-2.0** so any organisation can run it on **their own** infrastructure.

**Start here for adopters:** [Public documentation](https://intelligent.docs.blooo.dev/) — introduction, **full architecture views**, deploy-your-own, configuration, adapters, contribute. Source for that site: [`apps/site`](apps/site) (VitePress).

The service turns energy trades settled on a local market into **peer-to-peer invoices and payments between community members**, then publishes results to a project data space (EWDS).

> **Status:** V1 — D5.5 due **30/11/2026**. Communities run virtual (Stripe test) or live per community (Greenvolt first). EWDS Client Gateway adapters ship real and mock; mock stays the default until EWAG grants the topics and roles.

## Billing model — monthly statement + per-pair invoices

Documented in the [functional architecture](https://intelligent.docs.blooo.dev/architecture/01-functional-architecture) ([source](docs/architecture/01-functional-architecture.md)) and [requirements](docs/requirements/requirements.md) (assumptions A19–A22, business rules BR-01…BR-15):

| Rule | Meaning |
|---|---|
| Monthly statement | One per participant and period — totals bought/sold, net balance, list of invoices; not payable (**REQ-059**) |
| Invoice per pair | **Producer→consumer**, issued in the producer’s name, self-billing mandate in T&C (**REQ-054**, **REQ-050**) |
| Netting | Purchases and sales between the same pair are netted (**REQ-055**) |
| Threshold | Per pair, default 5 EUR/CHF, carried forward, forced at year end or exit (**REQ-056**; **REQ-057** deprecated) |
| Direct payment | Direct charge on the producer’s **Stripe Connect** account; the platform never holds funds (**REQ-014**) |
| Payout | Withdrawal or `autoPayout` once the debtors of the period have paid (**REQ-015**) |
| Grid fee / levy / tax | From the tariff port; 0 with a mention while no DSO tariff is published (**REQ-004**, **REQ-007**) |
| Market price is final | Uses `adjustedPrice` when GSY provides it, else `tradePrice`; billing never changes a trade status |

## Architecture at a glance

Five validated views (iterative, each refining the previous). **Read them on the [public docs site](https://intelligent.docs.blooo.dev/architecture/)** (INT-413); the markdown under `docs/architecture/` remains the source of truth.

| View | On the docs site | Source file | Answers |
|---|---|---|---|
| Functional | [Functional](https://intelligent.docs.blooo.dev/architecture/01-functional-architecture) | [`01-…`](docs/architecture/01-functional-architecture.md) | Actors, processes, objects, **BR-01…BR-15** |
| Logical | [Logical](https://intelligent.docs.blooo.dev/architecture/02-logical-architecture) | [`02-…`](docs/architecture/02-logical-architecture.md) | Blocks, data ownership, events, jobs |
| Application | [Application](https://intelligent.docs.blooo.dev/architecture/03-application-architecture) | [`03-…`](docs/architecture/03-application-architecture.md) | Modules **AC-02…AC-15** (AC-01 withdrawn, INT-455), internal APIs, **EWDS** records + commands, adapters, mocks; scenarios **S1–S14** ([`07-…`](docs/architecture/07-scenario-flows.md)) |
| Technical | [Technical](https://intelligent.docs.blooo.dev/architecture/04-technical-architecture) | [`04-…`](docs/architecture/04-technical-architecture.md) | Decisions **TD-1…TD-13**, principles **TP-1…TP-8** |
| Physical | [Physical](https://intelligent.docs.blooo.dev/architecture/05-physical-architecture) | [`05-…`](docs/architecture/05-physical-architecture.md) | Environments, Scaleway Kapsule (nl-ams), ops |

```mermaid
%% elk %%
flowchart LR
  R2M[R2M · project UI + member IdP] <-->|records + commands| EWDS[(EWDS)]
  EWDS <-->|mTLS · Client Gateway adapters, mock by default| CGW[Billing CGW]
  CGW --> GW[AC-02 APISIX]
  GW --> MOD[AC-03…AC-13 NestJS services]
  MOD --> PG[(PostgreSQL · CNPG)]
  MOD --> OUT[Outbox] --> DBZ[Debezium] --> NATS[NATS JetStream]
  SCH[AC-14 Temporal] --> MOD
  MOD --> STRIPE[(Stripe test / live per community)]
  MOD --> KC[(Keycloak)]
  MOD <-->|5 record topics + command channel| CGW
  MOD -.->|fixture| ECB[(ECB)]
```

**Runtime stack (TD-4…TD-11):** TypeScript · NestJS · PostgreSQL (CloudNativePG) · NATS JetStream · Debezium · Temporal · Apache APISIX · Keycloak · OpenBao + External Secrets · OpenTelemetry · Argo CD on Kubernetes.

## Repository map

| Path | Content |
|---|---|
| [`docs/requirements/`](docs/requirements/) | Personas, user stories, **REQ/NFR**, **UAT** item notes + narrative [`requirements.md`](docs/requirements/requirements.md) |
| [`docs/architecture/`](docs/architecture/) | Architecture views 01→05; [`ewds-topics/`](docs/architecture/ewds-topics/) draft EWDS schemas |
| [`docs/testing/`](docs/testing/) | Test plan, UAT package, validation summary, e2e notes |
| [`docs/release/`](docs/release/) | SemVer / GitHub Releases ([VERSIONING.md](docs/release/VERSIONING.md)), release notes, **reference** deploy notes |
| [`docs/maintainers/`](docs/maintainers/) | Upstream-only process pointers |
| [`contracts/`](contracts/) | **Contract-first** OpenAPI 3.1 (REST) and AsyncAPI 3 (events) |
| [`services/`](services/) | 12 NestJS services (AC-03…AC-14) — one database per service |
| [`apps/site/`](apps/site/) | **Public docs site** (VitePress → GitHub Pages); EWDS integration notes (INT-455 — no public `/v1` browser) |
| [`apps/docs-portal/`](apps/docs-portal/) | Redocly public OpenAPI portal |
| [`packages/`](packages/) | Shared NestJS module template, generated clients |
| [`mocks/`](mocks/) | AC-15 mock suite and integration fixtures (scenarios S1–S13; journeys S1–S14 in `docs/architecture/07-scenario-flows.md`) |
| [`deploy/`](deploy/) | Example Helm charts / GitOps manifests (adapt to your registry & DNS) |
| [`AGENTS.md`](AGENTS.md) | Detailed engineering rules (includes upstream notes) |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Open contribution first; upstream process optional |

### Module map (AC → directory)

| Directory | Component | Logical block |
|---|---|---|
| `deploy/` (APISIX) | AC-02 API gateway | LB-12, LB-01 |
| `services/participants` | AC-03 | LB-02 |
| `services/trade-intake` | AC-04 | LB-03 |
| `services/settlement` | AC-05 | LB-04 |
| `services/invoicing` | AC-06 | LB-05 |
| `services/payments` | AC-07 | LB-06 |
| `services/reconciliation` | AC-08 | LB-07 |
| `services/reporting` | AC-09 | LB-14 |
| `services/publication` | AC-10 | LB-08 |
| `services/notification` | AC-11 | LB-09 |
| `services/compliance` | AC-12 | LB-10 |
| `services/reference-data` | AC-13 | LB-11 |
| `services/scheduler` | AC-14 Temporal workers | LB-13 |
| `mocks/` | AC-15 Mock suite | — |
| `services/mock-cgw` | Mock CGW (INT-454, `dev` transport) | — |

Full map and non-negotiable rules: [`AGENTS.md`](AGENTS.md).

## Quality and CI

| Gate | What it enforces | Where |
|---|---|---|
| **GitHub Actions `ci`** | Secrets scan, contracts lint, every workspace `test` script, Helm charts, Sonar analysis | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |
| **Vitest coverage** | ≥ **80%** statements, branches, functions, lines per module | [`config/coverage-thresholds.json`](config/coverage-thresholds.json) |
| **Sonar “Intelligent V1”** | MQR Security / Reliability / Maintainability **A**, coverage ≥ 80%, duplication ≤ 10%, `new_violations = 0` | [`docs/release/sonarqube.md`](docs/release/sonarqube.md) |
| **Contract-first** | In CI today: Spectral, Redocly, AsyncAPI CLI, EWDS JSON-schema validation (Prism and openapi-typescript available). Target, not yet in CI: Orval, express-openapi-validator, Schemathesis, oasdiff | [`contracts/`](contracts/), TD-13 |
| **UAT package** | In-scope UATs tracked to Pass in item notes | [`docs/testing/v1-validation-summary.md`](docs/testing/v1-validation-summary.md) |

Sonar badges above mirror the Community Build project `blooo-io_intelligent-eu-billing-and-payment` (ratings refresh when CI analyses `develop`). The dashboard is the source of truth.

## Working on this repository

**Adopters / operators:** follow the [public docs](https://intelligent.docs.blooo.dev/) ([source](apps/site)) — especially [Deploy on Kubernetes](apps/site/guide/deploy.md).

**Contributors:** read [`CONTRIBUTING.md`](CONTRIBUTING.md) (open GitHub workflow first). Deep engineering rules: [`AGENTS.md`](AGENTS.md).

**Local quick start:** Node ≥ 22, pnpm 9 → `pnpm install` → `pnpm run contracts:lint` → `pnpm test`. Optional local cluster: TD-12 (k3d + Tilt) via `scripts/local-stack.mjs`. Docs site: `pnpm --filter @intelligent/site dev`.

Upstream reference cluster notes (example DNS / GitOps) live under [`docs/release/deployment.md`](docs/release/deployment.md) and [`docs/maintainers/`](docs/maintainers/) — not required for your own deployment.

## Documentation index

| Need | Start here |
|---|---|
| **Public operator docs** | [intelligent.docs.blooo.dev](https://intelligent.docs.blooo.dev/) · [`apps/site`](apps/site) |
| Architecture (all views) | [Docs site /architecture](https://intelligent.docs.blooo.dev/architecture/) · [`docs/architecture/`](docs/architecture/) |
| What / for whom | [Functional architecture](https://intelligent.docs.blooo.dev/architecture/01-functional-architecture) |
| REQ / UAT / assumptions | [requirements.md](docs/requirements/requirements.md) · [items/](docs/requirements/items/) |
| APIs & events | [`contracts/`](contracts/) · [API page](https://intelligent.docs.blooo.dev/api/) |
| How it is built | [Technical architecture](https://intelligent.docs.blooo.dev/architecture/04-technical-architecture) |
| Deploy your own | [Deploy guide](https://intelligent.docs.blooo.dev/guide/deploy) |
| Reference (example) deploy | [docs/release/deployment.md](docs/release/deployment.md) |
| Validation evidence | [v1-validation-summary.md](docs/testing/v1-validation-summary.md) |

## Licence

Apache License 2.0 — see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE). Runtime and shipped dependencies are **MIT or Apache-2.0** only (**TP-2**); documented exceptions for separate unmodified services (OpenBao, SonarQube Community, DDHub Client Gateway) are in the [technical architecture](docs/architecture/04-technical-architecture.md).
