# V1 functional and system execution log (INT-78)

Confirmed set: [`v1-functional-cases.md`](v1-functional-cases.md) (INT-76).  
**Run date:** 2026-10-17 · **Tester:** automated (agent)

## Method

1. Prefer existing module / template / deploy tests that cite the REQ/UAT.
2. Use live `dev` smoke (TLS, hosts, region labels) for platform NFRs.
3. Leave pilot-UX and multi-IdP cases as Not Run when no automated proof exists; do not invent Pass.

## Newly marked Pass this run

| UAT | Requirement | Evidence |
|---|---|---|
| UAT-003 | REQ-003 | Settlement netting uses `pricePerKWhEur` × kWh (`services/settlement` BR-03/04) |
| UAT-005 | REQ-005 | Settlement store rejects overwrite (BR-13) |
| UAT-010 | REQ-010 | Auth guard denies missing principal / role / community (`module-template`) |
| UAT-033 | NFR-001 | HTTPS `/health` on app host; Let's Encrypt prod certs (gateway smoke) |
| UAT-034 | NFR-002 | Cluster nodes labelled `topology.kubernetes.io/region=nl-ams` |
| UAT-035 | NFR-003 | Outbox uniqueness / idempotent write (`module-template` outbox specs) |
| UAT-037 | NFR-005 | Root `LICENSE` Apache-2.0 + `NOTICE`; no GPL/AGPL deps in workspace packages |
| UAT-038 | NFR-006 | Idempotent consumer retries without silent drop (`module-template`) |
| UAT-039 | NFR-007 | V1 payment path is Stripe test / FIAT only (no wallet UX) |
| UAT-041 | NFR-009 | Same as UAT-039 — crypto not required for V1 journeys |
| UAT-042 | NFR-010 | Every in-scope REQ/NFR has a linked `scope_d55: in` UAT with non-empty status |
| UAT-059 | NFR-012 | `LICENSE` + `NOTICE` present; Apache-2.0 |
| UAT-065 | NFR-014 | Mock PSP default in CI; Stripe SDK only behind adapters (INT-189) |
| UAT-066 | NFR-015 | Invalid webhook signature rejected without hanging (`payments` spec) |

## INT-80 batch (2026-10-17)

| UAT | Requirement | Evidence |
|---|---|---|
| UAT-036 | NFR-004 | Ontology mapping review — functional §5 + EWDS schemas + market mock types |
| UAT-045 | REQ-035 | Manual PKCE login on `app.dev` (S256 `code_challenge`; session after `/auth/callback`) |
| UAT-046 | REQ-036 | `config.json` issuer/clientId only; OIDC secret via OpenBao ExternalSecret |
| UAT-049 | NFR-011 | APISIX JWKS OIDC; forged foreign-issuer JWT → 401 on `/v1/me` |
| UAT-068 | NFR-017 | V1 mock CG (A32) + cluster region `nl-ams` (EU) |

## INT-80 batch (2026-10-18)

| UAT | Requirement | Result | Evidence |
|---|---|---|---|
| UAT-061 | NFR-013 | Pass | Code review — `oidc-client-ts` + config issuer; no Keycloak Admin API in web |
| UAT-064 | REQ-052 | Pass | Manual `app.dev` screens for onboarding / invoices / balances / operator |
| UAT-015 | REQ-015 | Blocked | Connect platform profile (losses) not accepted in Dashboard |
| UAT-028 | REQ-028 | Blocked | No seeded payment/trade for operator drill-down |
| UAT-040 | NFR-008 | Blocked | Billing-run duration target TBD |
| UAT-044 | REQ-034 | Out of scope | INT-192 — single project IdP only |
| UAT-047 | REQ-037 | Out of scope | INT-192 — no alternate IdP for V1 |
| UAT-050 | REQ-039 | Blocked | Depends on Connect accounts (platform profile) |
| UAT-051 | REQ-040 | Pass | INT-191 — Custom Account Tokens in-platform (producer KYC) |
| UAT-053 | REQ-042 | Blocked | Depends on Connect invoice numbering |
| UAT-067 | NFR-016 | Blocked | Needs pilot UX observation |

**Totals after this batch:** **56 Pass**, **0 Not Run**, **6 Blocked**, **0 Fail** (62 in-scope; UAT-044 / UAT-047 out).

## Commands / probes

```bash
pnpm --filter @intelligent/module-template test
pnpm --filter @intelligent/payments test
pnpm --filter @intelligent/settlement test
curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}\n' https://app.dev.intelligent-eu-bp.blooo.dev/health
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.labels.topology\.kubernetes\.io/region}{"\n"}{end}'
```
