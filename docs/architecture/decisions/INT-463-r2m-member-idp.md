---
title: "INT-463 — R2M owns member IdP; BPS Keycloak S2S-only"
date: 2026-11-26
status: accepted
---
# INT-463 — R2M owns member IdP; BPS Keycloak S2S-only

## Decision

Community **member** authentication and Keycloak user administration move to the **project UI (R2M)**. The Billing & Payment Service (BPS) keeps Keycloak only for:

1. **Service-to-service JWTs** (`module-service` client-credentials on `/internal/*`).
2. **Ops UI login** (Argo CD, Perses, Jaeger on `ops.*`).

BPS does **not** create, invite, or erase member IdP accounts on the product path. BPS does **not** validate end-user OIDC bearers for billing APIs (INT-455: no public `/v1`).

## Trust model (product path)

```text
User --OIDC JWT--> R2M (session; JWT never leaves R2M / never enters EWDS)
R2M maps IdP sub --> actorId
R2M/CGW signs billingCommandRequest (gateway DID)
EWDS --> BPS AC-10: channel role + DID allow-list + actor-role policies
```

Residual risk (documented B4): a compromised R2M CGW can assert any `actorId`. Mitigations: CGW key custody, DID allow-list, audit events.

## Keycloak usage matrix

| Usage | Owner after INT-463 |
|---|---|
| Member login (OIDC Auth Code + PKCE) | **R2M** (RP); Blooo-hosted Keycloak issuer |
| Member create / invite / erase | **R2M** via scoped Admin API |
| `module-service` S2S JWT | **BPS** (unchanged) |
| Ops UI SSO | **Blooo ops** (unchanged) |
| Actor ingest IdP ensure-user | **Removed** from BPS |
| `participants:by-idp-sub` | **Removed** (JWT-member bridge) |

## Spec impact (no renumbering)

| Item | Change |
|---|---|
| REQ-033 | Product-path OIDC RP is the **project UI**; BPS is not the human RP. |
| REQ-013 | IdP account erasure is **delegated to the project UI**; BPS records `delegated_to_project_ui`. |
| REQ-052 / INT-455 | Unchanged EWDS-only; reinforce: no end-user JWT on the command channel. |
| REQ-062 / A9 | DID/VC still D5.10; V1 stays OIDC on R2M. |
| A11 / DEV-02 | Written IdP operator remains consortium; operational split above. |

## Rationale

After INT-455, humans no longer authenticate to BPS. Continuing to provision Keycloak users from AC-03 duplicated ownership with R2M and sent invites toward a removed portal. Aligning member IdP with R2M matches Actor mastery (INT-447) and the EWDS trust boundary.
