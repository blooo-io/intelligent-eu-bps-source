# Introduction

The **INTELLIGENT Billing & Payment Service** turns settled local-market energy trades into **peer-to-peer invoices and payments** between community members, then publishes the results for other project systems.

It is developed under Horizon Europe project [INTELLIGENT](https://cordis.europa.eu/project/id/101160678) (GA 101160678), Task **T5.6**, Deliverable **D5.5**, and released as **open source** under the [Apache License 2.0](https://github.com/blooo-io/intelligent-eu-bps-source/blob/develop/LICENSE).

## Who this documentation is for

| Audience | Start here |
|---|---|
| Operators / platform teams deploying their own instance | [Deploy on Kubernetes](./deploy) |
| Integrators calling the APIs | [API & events](/reference/api) |
| Contributors improving the code | [How to contribute](/contribute/) |
| Architects reviewing the design | [Architecture views](/architecture/) |

This site describes how to **use and run** the software in **your** environment. Upstream maintainer workflows (specific cloud accounts, internal issue trackers, partner demo hosts) are optional reference material — see [Upstream maintainers](/contribute/upstream-maintainers).

## Billing model in one minute

1. **Monthly statement** per participant and billing period — informative totals and net balance; not payable (REQ-059).
2. **One invoice per consumer→producer pair** and period, issued **in the producer’s name** (self-billing).
3. Purchases and sales between the same pair are **netted**.
4. Amounts below a **per-pair threshold** are carried forward (forced settlement at year end or exit).
5. The consumer pays the producer **directly** via a charge on the producer’s Stripe Connect account; money never transits the billing platform. Producers **withdraw** (or schedule) payouts from their connected account once period invoices where they are producer are paid.

Grid fees, levies and taxes come from the tariff port; **0 with a mention** while no DSO tariff is published. Full business rules: [functional architecture](/architecture/01-functional-architecture) on this site.

## V1 scope

- Communities are **virtual or live** per community (`billingMode`); live rollout needs the operator role and live Stripe keys in your secret store.
- **Stripe** runs in test or live mode per community — Connect accounts, direct charges, payouts and webhooks (or your PSP adapter).
- **EWDS Client Gateway adapters** (market trade source, Actor intake, erasure intake, command channel, publication) are **real** in code and selected by environment variables; **mock is the default** until you enable them.
- The **INTELLIGENT project UI** reads billing records and sends commands through the EWDS — not through `/v1`. **`apps/web`** is a **reference client** on the public REST API for adopters without the project UI.
- Identity is OIDC (reference deployment uses Keycloak; any OIDC IdP works if claims match the contracts).

## Repository layout (high level)

| Path | Role |
|---|---|
| `contracts/` | OpenAPI / AsyncAPI — source of truth for APIs and events |
| `services/*` | NestJS modules (one database per module) |
| `apps/web` | Reference participant / manager UI |
| `deploy/` | Example Helm charts and GitOps manifests |
| `docs/` | Detailed architecture, requirements, testing evidence |
| `apps/site` | **This** public documentation site (VitePress) |
