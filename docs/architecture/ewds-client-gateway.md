# EWDS Client Gateway — Blooo instance (INT-306)

Status: **plan** (2026-10-23). Source: Energy Web D3.1 *Digital Spine Client Gateway* briefing + NFR-017.

> **V1 today:** P-DS / P-MKT stay on **mocks** (assumption A32). UAT-068 Pass is on the mock path. This note tracks the **live** Blooo Client Gateway and adapter cut-over. Mock remains the default until EWAG status is Configured + Verified.

## Briefing constraints

| Constraint | Implication |
|---|---|
| One Gateway per participant (no shared instance) | Deploy our own CG in an EU secured environment; Message Broker joins via mTLS |
| CG does **not** store payloads | Billing must persist every received message (durable store + idempotency on message id) |
| REST or WebSocket + `x-api-key` | System traffic uses API mode; enable auth (off by default in CG) |
| mTLS + DID / VC + funded EWT wallet | CSR → EWF; wallet ≥ 1 EWT; Message Broker VC (+ `topiccreator` if we publish) |
| Dedicated PostgreSQL + secrets engine | CG metadata DB + OpenBao for keys / API key / mTLS material |
| Network review | Egress to `ddhub-ewc.energyweb.org`, `rpc.energyweb.org`, `identitycache.energyweb.org` (confirm with EWAG) |

## Current EWAG status (as of May 2026 report)

| Gate | Status |
|---|---|
| Onboarded | yes |
| Configured | **no** |
| Verified | **no** |

Open assumptions: **A12** (GSY topic schemas / roles), **A26** (≤ 7 day cache — REQ-053).

## Open points for EWAG

1. **Transport:** briefing recommends WebSocket (integration slide) and short polling (API auth slide). Blooo proposal: **short polling** for NestJS workers unless EWAG requires WebSocket.
2. **Enable API authentication** and confirm `x-api-key` usage.
3. **Retention / purge** of CG PostgreSQL metadata/cache vs REQ-053 / A26.
4. **Roles and topics** for INTELLIGENT (`billingInvoice` / `billingPayment`, GSY query topics).

Draft topic schemas: [`ewds-topics/`](ewds-topics/README.md).

## Deployment phases

### Phase 0 — Unblock EWAG

Send the unblock mail (see Jira INT-306 / operator copy). Collect CSR process, egress list, schema dialect (JSON Schema 2020-12 vs draft-07 / JSD7).

### Phase 1 — Infra (GitOps only, INT-157)

1. Namespace for CG (e.g. `int-ewds`) on the EU cluster.
2. Dedicated PostgreSQL (CNPG) for CG metadata — not a Billing module database.
3. OpenBao paths + External Secrets for API key, DID material, mTLS cert/key.
4. NetworkPolicy / egress allow-list to EW hosts.
5. Package the official EWF Helm chart under `deploy/` + Argo Application. **No ad-hoc `helm install`.**

### Phase 2 — Enrolment

1. Fund EWC wallet (≥ 1 EWT); record Gateway DID.
2. CSR → EWF-signed mTLS certificate; install on CG.
3. VCs: Message Broker user; `topiccreator`; GSY subscriber roles when A12 closes.
4. Enable API auth; store `x-api-key` only in OpenBao.

### Phase 3 — Topics and Billing persistence

1. Register `billingInvoice` / `billingPayment` (and GSY channels when published).
2. Durable inbound message store in Billing (CG is not system of record for payloads).
3. Purge after successful ingest; hard max **7 days** (REQ-053).

### Phase 4 — Adapter cut-over

1. Real P-DS (AC-10) and P-MKT (AC-04) adapters selected by configuration; **mock remains default**.
2. First slice: short-polling consumer + publish path for invoice/payment.
3. Operator alerts: broker disconnect, mTLS expiry, silence threshold (REQ-029).
4. Re-execute UAT-068 / UAT-069 / UAT-001 / UAT-070 against live CG before changing `v1_mode`.

## Proposed Blooo decisions (pending EWAG)

| Topic | Proposal |
|---|---|
| Transport | Short polling for production workers; WebSocket optional later |
| Auth | API key required; UI off or Auth0-only; not on the public internet |
| Retention | Purge after ingest; hard max 7 days |
| Hosting | Helm on Scaleway `nl-ams`; OpenBao; GitOps only |

## Traceability

| Spec | Role |
|---|---|
| NFR-017 | Own CG in EU, API key, vault, EWF mTLS |
| REQ-001 | Ingest trades via CG (GSY channels) |
| REQ-048 | Publish invoice/payment via CG |
| REQ-053 | Purge ≤ 7 days |
| REQ-029 | Alerts on silence / disconnect / cert expiry |
| A12 / A26 / A32 | Schema dependency / retention / V1 mock |

## Related packaging (not yet in Git)

When Phase 1 starts, prefer:

- `deploy/charts/ewds-client-gateway/` (or vendor chart wrapper)
- `deploy/argocd/dev/ewds-client-gateway.yaml`
- `deploy/envs/dev/values-ewds-client-gateway.yaml`

Do not commit secret values. Operator kubeconfig stays outside the repository.
