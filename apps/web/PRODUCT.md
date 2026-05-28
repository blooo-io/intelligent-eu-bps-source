# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: energy-community **members** (consumers / producers) completing billing readiness, viewing balances and invoices, and paying via Stripe test. Secondary: **community managers** configuring settings and starting billing runs. Tertiary: **operators** for reconciliation and jobs.

Inferred from architecture §3.1 / §6 and INT-243 feedback (member confusion on manager screens).

## Product Purpose

Reference Billing & Payment portal (AC-01) for Horizon Europe INTELLIGENT. Lets each IdP role complete its billing job on the public `/v1` API without opening screens reserved for another role. Success: a member reaches Ready + pays an invoice; a manager starts a run; nobody is stranded on a raw 403.

## Positioning

Contract-first public API with a role-scoped reference UI. Partners may replace the screens (REQ-052); this app is the accelerator, not the only client.

## Operating Context

OIDC (Keycloak) → APISIX → Nest modules. Virtual communities, Stripe **test** only in V1. Community UUID is billing tenancy, not a person. Manual S1 journey uses seeded community `c0ffee00-1234-4abc-8def-0123456789ab`.

## Capabilities and Constraints

- Roles from IdP only (REQ-049): member, manager, operator.
- Nav and copy must match role + member readiness (INT-243).
- No personal data in logs; identifiers only.
- Stack: Refine + Ant Design + Vite (existing).

## Brand Commitments

Product name **INTELLIGENT billing**. Visual world **Gridline Energy** (forest / mist, Plus Jakarta Sans) — INT-188. Do not invent a second brand.

## Evidence on Hand

- `docs/architecture/03-application-architecture.md` screen map
- `docs/testing/manual-s1-portal-journey.md`
- Live `app.dev.intelligent-eu-bp.blooo.dev`
- No fabricated testimonials or metrics.

## Product Principles

1. **Role clarity first** — never offer a path the caller's role cannot complete.
2. **Say who and why** — signed-in identity and page purpose are always visible.
3. **Next action over encyclopedia** — one clear step when readiness is incomplete.
4. **Plain recovery** — errors name the problem and what to do; no raw API status as the only message.
5. **Operate restraint** — density and scanability beat decoration (Impeccable Operate mode).

## Accessibility & Inclusion

Keyboard-reachable shell and forms; contrast on forest/mist surfaces; do not rely on colour alone for readiness state.
