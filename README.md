# INTELLIGENT — Billing & Payment Service

[![CI](https://github.com/blooo-io/intelligent-eu-billing-and-payment/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/blooo-io/intelligent-eu-billing-and-payment/actions/workflows/ci.yml?query=branch%3Adevelop)
[![e2e-dev](https://github.com/blooo-io/intelligent-eu-billing-and-payment/actions/workflows/e2e-dev.yml/badge.svg)](https://github.com/blooo-io/intelligent-eu-billing-and-payment/actions/workflows/e2e-dev.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)](.nvmrc)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](docs/architecture/04-technical-architecture.md)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](docs/architecture/04-technical-architecture.md)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](apps/web)
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

[![UAT](https://img.shields.io/badge/UAT-62%2F62%20Pass-brightgreen)](docs/testing/v1-validation-summary.md)
[![Horizon Europe](https://img.shields.io/badge/Horizon%20Europe-GA%20101160678-003399)](https://cordis.europa.eu/project/id/101160678)
[![Deliverable](https://img.shields.io/badge/D5.5-T5.6-0B5FFF)](docs/release/RELEASE-NOTES.md)

Billing and payment service of the Horizon Europe project **INTELLIGENT** ([GA 101160678](https://cordis.europa.eu/project/id/101160678)). It covers **Task T5.6** and **Deliverable D5.5**, led by **[Blooo](https://blooo.io)**.

The service turns energy trades settled on the INTELLIGENT local market into **peer-to-peer invoices and payments between community members**, then publishes results to the project data space (EWDS).

> **Status:** V1 — target D5.5 at M24 (**30/11/2026**). Every community runs in **virtual mode**. The only real external integration is **Stripe in test mode**. GSY DEX, EWDS and ECB rates are mocked behind adapters ([assumption A32](docs/requirements/requirements.md)).

## Billing model — “the producer is the bank”

Documented in the [functional architecture](docs/architecture/01-functional-architecture.md) and [requirements](docs/requirements/requirements.md) (assumptions A19–A22, business rules BR-01…BR-13):

| Rule | Meaning |
|---|---|
| One invoice per pair | Each **consumer→producer** pair gets one invoice per period, issued **in the producer’s name** (self-billing) |
| Netting | Purchases and sales between the same pair are netted |
| Threshold | Amounts below a community threshold (e.g. 5 €/CHF) are carried forward; early settlement is possible |
| Direct payment | Money never transits through the platform — the consumer pays the producer’s **Stripe Connect** account |
| Off-invoice grid costs | Grid fees, taxes and levies stay on the supplier/DSO bill (**A20**) — not on P2P invoices |
| Market price is final | Billing never recomputes market results or changes a trade status |

## Architecture at a glance

Five validated views (iterative, each refining the previous):

| View | File | Answers |
|---|---|---|
| Functional | [`01-functional-architecture.md`](docs/architecture/01-functional-architecture.md) | Actors, processes, objects, **BR-01…BR-13** |
| Logical | [`02-logical-architecture.md`](docs/architecture/02-logical-architecture.md) | Blocks, data ownership, events, jobs |
| Application | [`03-application-architecture.md`](docs/architecture/03-application-architecture.md) | Modules **AC-01…AC-15**, APIs, adapters, mocks S1–S13 |
| Technical | [`04-technical-architecture.md`](docs/architecture/04-technical-architecture.md) | Decisions **TD-1…TD-13**, principles **TP-1…TP-8** |
| Physical | [`05-physical-architecture.md`](docs/architecture/05-physical-architecture.md) | Environments, Scaleway Kapsule (nl-ams), ops |

```mermaid
%% elk %%
flowchart LR
  WEB[AC-01 Web · Refine] --> GW[AC-02 APISIX]
  GW --> MOD[AC-03…AC-13 NestJS modules]
  MOD --> PG[(PostgreSQL · CNPG)]
  MOD --> OUT[Outbox] --> DBZ[Debezium] --> NATS[NATS JetStream]
  SCH[AC-14 Temporal] --> MOD
  MOD --> STRIPE[(Stripe test)]
  MOD --> KC[(Keycloak)]
  MOD -.->|mocked V1| EXT[(GSY DEX · EWDS · ECB)]
```

**Runtime stack (TD-4…TD-11):** TypeScript · NestJS · React/Refine · PostgreSQL (CloudNativePG) · NATS JetStream · Debezium · Temporal · Apache APISIX · Keycloak · OpenBao + External Secrets · OpenTelemetry · Argo CD on Kubernetes.

## Repository map

| Path | Content |
|---|---|
| [`docs/requirements/`](docs/requirements/) | Personas, user stories, **REQ/NFR**, **UAT** item notes + narrative [`requirements.md`](docs/requirements/requirements.md) |
| [`docs/architecture/`](docs/architecture/) | Architecture views 01→05; [`ewds-topics/`](docs/architecture/ewds-topics/) draft EWDS schemas |
| [`docs/testing/`](docs/testing/) | Test plan, UAT package, validation summary, e2e notes |
| [`docs/release/`](docs/release/) | D5.5 operator notes: [deploy](docs/release/deployment.md), [API](docs/release/integration-api.md), [release notes](docs/release/RELEASE-NOTES.md), [SonarQube](docs/release/sonarqube.md) |
| [`contracts/`](contracts/) | **Contract-first** OpenAPI 3.1 (REST) and AsyncAPI 3 (events) |
| [`services/`](services/) | NestJS modules — one database per module |
| [`apps/web/`](apps/web/) | AC-01 reference UI (participant portal + manager console) |
| [`packages/`](packages/) | Shared NestJS module template, generated clients |
| [`mocks/`](mocks/) | AC-15 mock suite and scenarios S1–S13 |
| [`deploy/`](deploy/) | Helm charts, helmfile, Argo CD apps (`dev` / `demo`) |
| [`AGENTS.md`](AGENTS.md) | Rules for contributors and coding agents |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Branching, DoD, Jira `INT` workflow |

### Module map (AC → directory)

| Directory | Component | Logical block |
|---|---|---|
| `apps/web` | AC-01 Web app | — |
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

Full map and non-negotiable rules: [`AGENTS.md`](AGENTS.md).

## Quality and CI

| Gate | What it enforces | Where |
|---|---|---|
| **GitHub Actions `ci`** | Secrets scan, contracts lint, every workspace `test` script, Helm charts, Sonar analysis | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |
| **Vitest coverage** | ≥ **80%** statements, branches, functions, lines per module | [`config/coverage-thresholds.json`](config/coverage-thresholds.json) |
| **Sonar “Intelligent V1”** | MQR Security / Reliability / Maintainability **A**, coverage ≥ 80%, duplication ≤ 10%, `new_violations = 0` | [`docs/release/sonarqube.md`](docs/release/sonarqube.md) |
| **Contract-first** | Spectral + Redocly + AsyncAPI validate; Schemathesis / oasdiff in the pipeline | [`contracts/`](contracts/), TD-13 |
| **UAT package** | In-scope UATs tracked to Pass in item notes | [`docs/testing/v1-validation-summary.md`](docs/testing/v1-validation-summary.md) |

Sonar badges above mirror the Community Build project `blooo-io_intelligent-eu-billing-and-payment` (ratings refresh when CI analyses `develop`). The dashboard is the source of truth.

## Working on this repository

1. Read [`AGENTS.md`](AGENTS.md) then [`CONTRIBUTING.md`](CONTRIBUTING.md).
2. Open or create a Jira issue in project **`INT`** (Blooo). Branch from `develop` as `<type>/INT-xxx-short-description`.
3. Change **contracts** first when the API or events change; implement; keep tests and UAT notes in sync.
4. Open a PR (template), request `blooo-io/github-admin`, squash-merge when CI is green.

**Local quick start (high level):** Node ≥ 22, pnpm 9 — see [deployment / local notes](docs/release/deployment.md) and TD-12 (k3d + Tilt). Run `pnpm test` from the repo root for the full Vitest matrix; `pnpm run contracts:lint` for OpenAPI/AsyncAPI lint.

**Deploy:** GitOps only to `k8s-intelligent-eu-dev` (`dev`) via Argo CD tracking `develop` ([INT-157](https://blooo-io.atlassian.net/browse/INT-157)). Do not mutate the cluster ad hoc. Operator kubeconfig stays outside Git (`KUBECONFIG`).

## Documentation index

| Need | Start here |
|---|---|
| What / for whom | [Functional architecture](docs/architecture/01-functional-architecture.md) |
| REQ / UAT / assumptions | [requirements.md](docs/requirements/requirements.md) · [items/](docs/requirements/items/) · [traceability](docs/requirements/traceability-dashboard.md) |
| APIs & events | [`contracts/`](contracts/) · [integration-api.md](docs/release/integration-api.md) |
| How it is built | [Technical architecture](docs/architecture/04-technical-architecture.md) |
| How it is deployed | [Physical architecture](docs/architecture/05-physical-architecture.md) · [deployment.md](docs/release/deployment.md) |
| Validation evidence | [v1-validation-summary.md](docs/testing/v1-validation-summary.md) |
| Release package | [docs/release/](docs/release/) |

## Licence

Apache License 2.0 — see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE). Runtime and shipped dependencies are **MIT or Apache-2.0** only (**TP-2**); documented exceptions for separate unmodified services (OpenBao, SonarQube Community) are in the [technical architecture](docs/architecture/04-technical-architecture.md).
