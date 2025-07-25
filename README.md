# INTELLIGENT — Billing & Payment Service

Billing and payment service of the Horizon Europe project **INTELLIGENT** (GA 101160678). It covers **Task T5.6** and **Deliverable D5.5**, led by **Blooo**.

The service turns energy trades settled on the INTELLIGENT local market into **peer-to-peer invoices and payments between community members**, following the "producer is the bank" model:
- one invoice per consumer→producer pair, issued in the producer's name;
- netting per pair;
- direct payment to the producer through Stripe Connect.

It then publishes invoices and payments to the project data space (EWDS).

> **Status:** V1 in development, target D5.5 at M24 (30/11/2026). In V1 every community runs in **virtual mode** and the only real integration is **Stripe in test mode**. All other external systems (GSY DEX, EWDS, ECB rates) are mocked.

## Repository map

| Path | Content |
|---|---|
| `docs/requirements/` | Specification: personas, user stories, requirements, UAT. One note per item in `items/`, plus narrative views |
| `docs/architecture/` | Architecture views 01 (functional) → 05 (physical), all validated; `ewds-topics/` holds the draft EWDS schemas |
| `contracts/` | **API contracts, written before code.** OpenAPI 3.1 for the REST APIs, AsyncAPI 3 for the events |
| `services/` | Back-end modules (NestJS, TypeScript), one per logical block |
| `apps/web/` | Reference screens (Refine): participant portal and community-manager console |
| `packages/` | Shared module template, generated clients, common libraries |
| `mocks/` | Mock suite (AC-15) and scenario datasets S1–S13 |
| `deploy/` | Helm charts, helmfile, environment values (`dev`, `demo`) for the Scaleway Kapsule cluster |
| `AGENTS.md` | Instructions for contributors and coding agents |

## Working on this repository
- **Where to start:** read [`AGENTS.md`](AGENTS.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **Work items:** tracked in the Blooo Jira project **INTELLIGENT (`INT`)**. Branches use `<type>/INT-123-short-description` (`feature`, `fix`, `docs`, `test`, `refactor`, `ci` or `chore`). Commits and pull requests carry the Jira key.
- **Documentation:** `docs/` is the single source of truth for what is built. Update the spec and the code in the same pull request.

## Licence
Apache License 2.0, see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE). Only MIT or Apache-2.0 third-party components are used (see the technical architecture §4).
