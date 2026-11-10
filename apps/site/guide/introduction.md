# Introduction

The **INTELLIGENT Billing & Payment Service** turns settled local-market energy trades into **peer-to-peer invoices and payments** between community members, then publishes the results for other project systems.

It is developed under Horizon Europe project [INTELLIGENT](https://cordis.europa.eu/project/id/101160678) (GA 101160678), Task **T5.6**, Deliverable **D5.5**, and released as **open source** under the [Apache License 2.0](https://github.com/blooo-io/intelligent-eu-bps-source/blob/develop/LICENSE).

## Who this documentation is for

| Audience | Start here |
|---|---|
| Operators / platform teams deploying their own instance | [Deploy on Kubernetes](./deploy) |
| Integrators calling the APIs | [API & events](/reference/api) |
| Contributors improving the code | [How to contribute](/contribute/) |
| Architects reviewing the design | [Architecture](/reference/architecture) |

This site describes how to **use and run** the software in **your** environment. Upstream maintainer workflows (specific cloud accounts, internal issue trackers, partner demo hosts) are optional reference material — see [Upstream maintainers](/contribute/upstream-maintainers).

## Billing model in one minute

1. **One invoice per consumer→producer pair** and billing period, issued **in the producer’s name** (self-billing).
2. Purchases and sales between the same pair are **netted**.
3. Amounts below a community **threshold** are carried forward; early settlement is possible.
4. The consumer pays the producer **directly** through the payment provider (Stripe Connect). Money does not transit through the billing platform.
5. Grid fees, taxes and levies stay on the supplier/DSO bill — not on P2P invoices.

Full business rules: [functional architecture](https://github.com/blooo-io/intelligent-eu-bps-source/blob/develop/docs/architecture/01-functional-architecture.md) in the repository.

## V1 scope

- Communities run in **virtual** mode.
- The only required real external integration is **Stripe test mode** (or your own PSP adapter).
- Local market (GSY DEX), data space (EWDS) and ECB FX rates ship with **mock adapters** you can replace.
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
