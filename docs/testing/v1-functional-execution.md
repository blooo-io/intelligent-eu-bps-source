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
| UAT-065 | NFR-014 | No direct `stripe` SDK import under `services/` (adapter/mock only) |
| UAT-066 | NFR-015 | Invalid webhook signature rejected without hanging (`payments` spec) |

## INT-80 batch (2026-10-17)

| UAT | Requirement | Evidence |
|---|---|---|
| UAT-036 | NFR-004 | Ontology mapping review — functional §5 + EWDS schemas + market mock types |
| UAT-045 | REQ-035 | Manual PKCE login on `app.dev` (S256 `code_challenge`; session after `/auth/callback`) |
| UAT-046 | REQ-036 | `config.json` issuer/clientId only; OIDC secret via OpenBao ExternalSecret |
| UAT-049 | NFR-011 | APISIX JWKS OIDC; forged foreign-issuer JWT → 401 on `/v1/me` |
| UAT-068 | NFR-017 | V1 mock CG (A32) + cluster region `nl-ams` (EU) |

## Still Not Run (needs further work or pilots)

| UAT | Requirement | Reason |
|---|---|---|
| UAT-015 | REQ-015 | Stripe Connect payout — OpenBao Stripe keys not seeded (`payments` Secret is placeholder) |
| UAT-028 | REQ-028 | Full trade→balance end-to-end trace API not smoked on cluster |
| UAT-040 | NFR-008 | Performance window TBD with pilots |
| UAT-044, UAT-047, UAT-061 | IdP REQs/NFRs | Second / multi-community IdP not provisioned; vendor swap not live-tested |
| UAT-050, UAT-051, UAT-053 | Invoice PDF / onboarding / numbering | Stripe artefacts blocked on missing test keys |
| UAT-064 | REQ-052 | Documented API journey + screens end-to-end not completed |
| UAT-067 | NFR-016 | UX step-count needs pilot observation |

Prior Pass rows from INT-75 / portal work remain Pass (see functional-cases inventory).

## Commands / probes

```bash
pnpm --filter @intelligent/module-template test
pnpm --filter @intelligent/payments test
pnpm --filter @intelligent/settlement test
curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}\n' https://app.dev.intelligent-eu-bp.blooo.dev/health
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.labels.topology\.kubernetes\.io/region}{"\n"}{end}'
```
