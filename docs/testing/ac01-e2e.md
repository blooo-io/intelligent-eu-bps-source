# AC-01 browser E2E (INT-182)

Playwright smoke for the Refine web app (`apps/web`) against a **fully deployed** stack (APISIX + web + Keycloak + APIs on the cluster). Catches auth-gate / routing regressions such as INT-181 (blank `/` while `/login` worked).

E2E is **not** run inside a cloistered GitHub Actions job with a local static build. That would miss gateway / TLS / IdP / CORS issues.

## What runs

| Spec | Asserts |
|---|---|
| `e2e/auth-gate.spec.ts` | Unauthenticated `GET /` → login UI (`Sign in with IdP`); `/login` shows the same CTA; no password field (REQ-033 / UAT-043) |

Authenticated IdP happy-path (sign-in → callback → home) needs Keycloak test users and is **out of scope** for the first slice.

## Prerequisites

1. `dev` (or the target env) is healthy: Argo apps synced, `apps-web:develop` rolled out, APISIX routes up.
2. Chromium for Playwright installed once: `pnpm --filter @intelligent/web test:e2e:install`

## Run against `dev`

```bash
E2E_BASE_URL=https://app.dev.intelligent-eu-bp.blooo.dev \
  pnpm --filter @intelligent/web test:e2e
```

`E2E_BASE_URL` is **required**. There is no localhost webServer fallback.

## CI / CD

No PR job. Any `test:e2e` / `test:e2e:*` script is skipped by `scripts/run-tests.mjs`.

Post-deploy verification (after `supply-chain` on `develop`): see [`ac01-e2e-cd.md`](ac01-e2e-cd.md) (INT-184) — workflow `e2e-dev` rolls `deploy/web` then runs this suite against `app.dev`.
