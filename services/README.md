# services/

One NestJS (TypeScript) service per logical block. Each service is generated from `packages/module-template`, has its own database, and talks to other modules only through internal APIs and events. See `AGENTS.md` §5 and `docs/architecture/03-application-architecture.md`.

| Directory | Component | Responsibility |
|---|---|---|
| `cd-smoke/` | factory (INT-156) | Health-only CD smoke image to prove CI → GHCR → Helm before product modules |
| `participants/` | AC-03 | Communities, registry, profiles, terms, readiness, Keycloak provisioning |
| `trade-intake/` | AC-04 | Market queries (mocked GSY DEX in V1), attribution, completeness |
| `settlement/` | AC-05 | Billing runs, pair settlement, netting, threshold, FX, VAT, ledger |
| `invoicing/` | AC-06 | Stripe Invoicing on producer accounts, legal numbering, lifecycle |
| `payments/` | AC-07 | Stripe Connect/Identity onboarding, payments, webhooks |
| `reconciliation/` | AC-08 | Invoice↔payment and market↔clearing checks |
| `reporting/` | AC-09 | Read models, manager views, KPI export |
| `publication/` | AC-10 | billingInvoice / billingPayment to EWDS (mocked in V1) |
| `notification/` | AC-11 | E-mails (Mailpit in V1) |
| `compliance/` | AC-12 | Audit, retention, GDPR requests |
| `reference-data/` | AC-13 | ECB rates (fixture in V1), VAT per community |
| `scheduler/` | AC-14 | Temporal workers for time-based jobs |
