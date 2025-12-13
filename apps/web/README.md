# apps/web (AC-01)

Reference screens built with **Refine** (`@refinedev/core`) + **Ant Design** (MIT) on React (TD-5).
They consume **only the public API** `/v1` and authenticate with **OIDC Authorization Code + PKCE** against Keycloak (REQ-033, NFR-011). The billing app never prompts for or stores a password.

`@refinedev/antd` is intentionally not used yet: it pulls `@ant-design/pro-layout` → `path-to-regexp@8.2.0` (CVE-2026-4926). Screens use `antd` directly with a local theme.

## Screens (03 §6)

| Issue | Screen | Status |
|---|---|---|
| INT-137 | Sign-in (IdP) + home readiness checklist (`GET /me`) | Done |
| INT-138 | Profile (`PUT /me/profile`) | Done |
| INT-139 | Terms + self-billing mandate | Done |
| INT-140 | Payment setup (Stripe onboarding) | This package |
| INT-141+ | Balances, invoices, … | Follow-on |

## Local

```bash
pnpm --filter @intelligent/web install
pnpm --filter @intelligent/web dev
```

Vite defaults to `http://localhost:5173` (registered on the Keycloak `web` client).
Optional env: `VITE_OIDC_AUTHORITY`, `VITE_OIDC_CLIENT_ID`, `VITE_API_BASE_URL`.

## Container

`Dockerfile` serves the Vite build with a small Node static server:

- `GET /health` → probes (module chart)
- `GET /config.json` → runtime OIDC/API config from env
- SPA fallback to `index.html`
