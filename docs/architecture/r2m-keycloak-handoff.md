---
title: "R2M Keycloak handoff (INT-463 / INT-295)"
date: 2026-11-26
status: active
---
# R2M Keycloak handoff

Blooo hosts Keycloak (`auth.intelligent-eu-bp.blooo.dev`, realm `int` on `dev`). **R2M** is the OIDC relying party and the admin of **member** accounts. BPS no longer creates or invites members in Keycloak.

Secrets are minted in OpenBao and shared **out of band** — never committed to Git.

## 1. OIDC client (member login)

| Setting | Value |
|---|---|
| Issuer | `https://auth.intelligent-eu-bp.blooo.dev/realms/int` |
| Flow | Authorization Code + **PKCE** (S256) |
| Client type | Public or confidential SPA/BFF (R2M choice) |
| Suggested client id | `r2m-ui` (provisioned by Blooo ops) |
| Redirect URIs | R2M-owned HTTPS callbacks only |

R2M validates ID/access tokens locally (JWKS from the issuer). **Do not** forward the bearer JWT into EWDS messages.

After login, R2M binds `sub` (and optional email) to the community **`actorId`** before publishing Actors or sending `billingCommandRequest` payloads.

## 2. Admin API client (create / invite / erase)

| Setting | Value |
|---|---|
| Suggested client id | `r2m-user-admin` |
| Grant | Client credentials |
| Scope | **Least privilege** — create users, send execute-actions email (VERIFY_EMAIL / UPDATE_PASSWORD), assign agreed realm roles or groups, delete user. **Not** `realm-management` full manage. |

Typical operations (Keycloak Admin REST, realm `int`):

1. **Create** — `POST /admin/realms/int/users` with email, `enabled`, attribute `community_id` / role mapping agreed with Blooo.
2. **Invite** — `PUT .../users/{id}/execute-actions-email` with `VERIFY_EMAIL`, `UPDATE_PASSWORD` (or R2M’s chosen actions).
3. **Erase** — `DELETE /admin/realms/int/users/{id}` when fulfilling a DSAR (REQ-013); BPS will report IdP erasure as delegated to the project UI.

Client secret: OpenBao path agreed with Blooo (e.g. `platform/r2m-user-admin`); rotate on schedule.

## 3. EWDS / BPS contract (reminder)

| Do | Do not |
|---|---|
| Publish `actor` from R2M; send commands with `actorId` | Put OIDC access/ID tokens in command or record payloads |
| Sign messages with the **R2M Client Gateway DID** | Expect BPS to resolve JWT `sub` → participant |
| Keep member sessions on R2M | Call BPS public `/v1` (removed, INT-455) |

BPS authorizes commands with: EWDS channel role → sender DID allow-list → actor role policy ([`command-authorizer.ts`](../../services/publication/src/commands/command-authorizer.ts)).

## 4. What BPS still uses Keycloak for

- Nest modules: `module-service` client-credentials on `/internal/*`.
- Ops: `ops.intelligent-eu-bp.blooo.dev` (Argo CD, Perses, Jaeger).

Member admin traffic must not rely on BPS Keycloak admin credentials.

## Trace

INT-463, INT-295, INT-455, REQ-033, REQ-052, REQ-013.
