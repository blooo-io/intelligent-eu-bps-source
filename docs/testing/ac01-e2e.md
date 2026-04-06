# AC-01 browser E2E (INT-182 / INT-211)

Playwright verification for the Refine web app (`apps/web`) against a **fully deployed** stack (APISIX + web + Keycloak + APIs on the cluster). Catches auth-gate / routing regressions such as INT-181 (blank `/` while `/login` worked) and live UI regressions across every shell screen (INT-211).

E2E is **not** run inside a cloistered GitHub Actions job with a local static build. That would miss gateway / TLS / IdP / CORS issues.

## What runs

| Spec | Asserts |
|---|---|
| `e2e/auth-gate.spec.ts` | Unauthenticated `GET /` → login UI (`Sign in with IdP`); `/login` shows the same CTA; no password field (REQ-033 / UAT-043) |
| `e2e/nav-shell.spec.ts` | Every sider nav item opens its page; Sign out returns to login (UAT-064) |
| `e2e/member-screens.spec.ts` | `uat-member`: Home readiness, Profile save, Terms CTA, Payment setup start, wizard steps, Balances, Invoices View/PDF/Pay, Privacy export+refresh, Reports history (UAT-013 / UAT-064 / UAT-067) |
| `e2e/manager-screens.spec.ts` | `uat-manager`: Community settings save, Participants Import/Edit, Billing runs Start+Refresh, Payments overview status panel, Reports summary |
| `e2e/operator-screens.spec.ts` | `uat-operator`: Operator anomalies / discrepancies / jobs; Job Run when present (INT-149) |
| `e2e/onboarding-wizard.spec.ts` | Authenticated `uat-member` reaches `/onboarding` Steps wizard (INT-193 / INT-194 / UAT-067). Skip with `E2E_SKIP_AUTH=1`. |
| `e2e/helpers/auth.ts` | Shared Keycloak login for the three UAT roles |

Keycloak UAT users (`uat-member` / `uat-manager` / `uat-operator`) are packed in the `int` realm import and AC-03 seed (INT-194). Password placeholder: `Intelligent-UAT-2026!` (V1 `dev`/`int` only).

Destructive actions (Offboard, invoice Void, unpaid Pay) are asserted as **visible** but not always submitted, to keep the seed intact.

## Backend gaps fixed with this suite (INT-211)

Live click-through found `GET /v1/me/balances` and `POST /v1/communities/{id}/billing-runs` returning **404** (routes existed in APISIX / OpenAPI but AC-05 had no public controllers). Settlement now serves those paths; APISIX also matches `/v1/communities/*/billing-runs` at priority 60.

## Prerequisites

1. `dev` (or the target env) is healthy: Argo apps synced, `apps-web:develop` rolled out, APISIX routes up.
2. Chromium for Playwright installed once: `pnpm --filter @intelligent/web test:e2e:install`

## Run against `dev`

```bash
E2E_BASE_URL=https://app.dev.intelligent-eu-bp.blooo.dev \
  pnpm --filter @intelligent/web test:e2e
```

Or: `pnpm --filter @intelligent/web test:e2e:dev`

`E2E_BASE_URL` is **required**. There is no localhost webServer fallback.

Optional env overrides: `E2E_UAT_MEMBER_USER` / `PASSWORD`, `E2E_UAT_MANAGER_*`, `E2E_UAT_OPERATOR_*`, `E2E_SKIP_AUTH=1` (auth-gate only).

## CI / CD

No PR job. Any `test:e2e` / `test:e2e:*` script is skipped by `scripts/run-tests.mjs`.

Post-deploy verification (after `supply-chain` on `develop`): see [`ac01-e2e-cd.md`](ac01-e2e-cd.md) (INT-184) — workflow `e2e-dev` rolls `deploy/web` then runs this suite against `app.dev`.
