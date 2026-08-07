# AC-01 browser E2E (INT-182 / INT-211 / INT-218 / INT-251)

Playwright verification for the Refine web app (`apps/web`) against a **fully deployed** stack (APISIX + web + Keycloak + APIs on the cluster).

E2E is **not** run inside a cloistered GitHub Actions job with a local static build.

## What runs

### Smoke (shell / CTA)

| Spec | Asserts |
|---|---|
| `e2e/auth-gate.spec.ts` | Unauthenticated gate (REQ-033 / UAT-043) |
| `e2e/nav-shell.spec.ts` | Every sider route loads (UAT-064) |
| `e2e/member-screens.spec.ts` | Member CTA smoke |
| `e2e/manager-screens.spec.ts` | Manager CTA smoke |
| `e2e/operator-screens.spec.ts` | Operator sections (INT-149) |
| `e2e/onboarding-wizard.spec.ts` | Wizard Steps visible (UAT-067) |

### REQ-mapped journeys (INT-218)

Hard asserts on REQ outcomes (no soft-accept of API error alerts).

| Spec | Requirements / UATs |
|---|---|
| `e2e/journeys/auth-oidc-session.spec.ts` | REQ-033, REQ-035 · UAT-043, UAT-045 |
| `e2e/journeys/onboarding-happy-path.spec.ts` | REQ-009, REQ-050, NFR-007 · UAT-009, UAT-062, UAT-067 |
| `e2e/journeys/payment-setup.spec.ts` | REQ-015, REQ-051 · UAT-015, UAT-051 |
| `e2e/journeys/invoices-pdf-pay.spec.ts` | REQ-007, REQ-014, REQ-039 · UAT-007, UAT-014, UAT-050 |
| `e2e/journeys/money-path-stripe.spec.ts` | INT-251 · REQ-014 / UAT-014 / TD-6 — Pay must create a succeeded Stripe Charge |
| `e2e/journeys/balances-settle.spec.ts` | REQ-057 · UAT-074 |
| `e2e/journeys/manager-billing-run.spec.ts` | REQ-006, REQ-043 · UAT-006 |
| `e2e/journeys/participant-import.spec.ts` | REQ-008 · UAT-008 |
| `e2e/journeys/payments-overview.spec.ts` | REQ-016, REQ-018 |
| `e2e/journeys/privacy-reports-operator.spec.ts` | REQ-013, REQ-031, REQ-032, REQ-041 · UAT-013, UAT-031, UAT-032, UAT-052 |
| `e2e/journeys/operator-payment-trace.spec.ts` | REQ-028 · UAT-028 |

Keycloak UAT users: `hugo.petit` / `sofia.garcia` / `paul.nguyen` · password `Intelligent-UAT-2026!`.

Invoice / settle / overview journeys expect seeded community data (UAT-028 / UAT-053 seed scripts).

## Run against `dev`

```bash
pnpm --filter @intelligent/web test:e2e:dev
```

## CI / CD

No PR job (`scripts/run-tests.mjs` skips `test:e2e*`). Post-deploy: [`ac01-e2e-cd.md`](ac01-e2e-cd.md) / workflow `e2e-dev`.

## Platform hardening (INT-212)

Outbox Postgres + Debezium (payments + settlement) + Keycloak Admin + Temporal worker + NATS JetStream are packaged under INT-213…217 so journeys hit real adapters on `dev`, not in-memory stubs.
