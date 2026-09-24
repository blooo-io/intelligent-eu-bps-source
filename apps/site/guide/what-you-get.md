# What you get

The repository is a **monorepo** that packages a complete billing stack you can run yourself.

## Application modules

Thirteen NestJS domain modules plus a web app and a mock suite. Each module owns its PostgreSQL database and talks to others only through **internal HTTP APIs** and **events** (transactional outbox → CDC → NATS JetStream).

| Module | Responsibility |
|---|---|
| Participants | Registry, readiness, terms, community settings |
| Trade intake | Settled trades from market / data space (or mock) |
| Settlement | Billing runs, netting, threshold, carry-forward |
| Invoicing | Self-billing invoices (Stripe Invoicing in V1) |
| Payments | Connect accounts, KYC, payment methods, webhooks |
| Reconciliation | Invoice ↔ payment and market checks |
| Reporting | Read models, KPI export, operator traces |
| Publication | Outbound billing events to the data space |
| Notification | E-mail / alerts (Mailpit locally) |
| Compliance | Audit, retention, data-subject requests |
| Reference data | FX / VAT reference |
| Scheduler | Temporal workflows and timers |
| Web app | Reference UI on the **public** API only |

See [Modules](/reference/modules) for the directory map.

## Platform pieces (reference packaging)

The `deploy/` tree shows **one** way to run the stack on Kubernetes:

- API gateway (Apache APISIX)
- Identity (Keycloak)
- Messaging (NATS JetStream) + Debezium
- Workflows (Temporal)
- Secrets (OpenBao + External Secrets Operator) — **replaceable**
- Observability (OpenTelemetry / Prometheus / …)

You may substitute equivalent components (another gateway, IdP, vault, GitOps engine) as long as the **module contracts** stay satisfied.

## What is not included

- Production Stripe live-mode go-live runbooks for your legal entity
- Grid / DSO billing
- Crypto or AMM payment rails
- A mandatory cloud vendor — the reference charts assume generic Kubernetes APIs
