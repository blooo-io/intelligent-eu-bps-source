# EWDS / DDHub Client Gateway — Blooo instance (INT-306)

Status: **plan** (2026-10-23). Sources: Energy Web official docs + D3.1 briefing + NFR-017.

> **V1 today:** P-DS / P-MKT stay on **mocks** (assumption A32). UAT-068 Pass is on the mock path. This note tracks the **live** Blooo Client Gateway and adapter cut-over. Mock remains the default until EWAG status is Configured + Verified.

## Official documentation (Energy Web)

Entry point:

- [DDHub Client Gateway](https://docs.energyweb.org/energy-solutions/digital-spine-by-energy-web/component-guides/ddhub-client-gateway)

Key pages for our work:

| Topic | URL |
|---|---|
| Preparing to set up | [preparing-to-set-up-a-client-gateway](https://docs.energyweb.org/energy-solutions/digital-spine-by-energy-web/component-guides/ddhub-client-gateway/deployment-guide/preparing-to-set-up-a-client-gateway) |
| Prerequisites (Postgres, vault, Helm) | [understand-and-prepare-the-prerequisites](https://docs.energyweb.org/energy-solutions/digital-spine-by-energy-web/component-guides/ddhub-client-gateway/deployment-guide/self-hosted/understand-and-prepare-the-prerequisites) |
| Deploy with Kubernetes | [deploy-with-kubernetes](https://docs.energyweb.org/energy-solutions/digital-spine-by-energy-web/component-guides/ddhub-client-gateway/deployment-guide/self-hosted/deploy-with-kubernetes) / [deploy-the-client-gateway](https://docs.energyweb.org/energy-solutions/digital-spine-by-energy-web/component-guides/ddhub-client-gateway/deployment-guide/self-hosted/deploy-with-kubernetes/deploy-the-client-gateway) |
| Integration (REST / WebSocket, `x-api-key`) | [integration-options](https://docs.energyweb.org/energy-solutions/digital-spine-by-energy-web/component-guides/ddhub-client-gateway/technical-guide/integration-options) |
| Configure mTLS (post-deploy) | [configure-mtls](https://docs.energyweb.org/energy-solutions/digital-spine-by-energy-web/component-guides/ddhub-client-gateway/deployment-guide/post-deployment/configure-mtls) |
| Auth / key vault | [authentication-and-authorization](https://docs.energyweb.org/energy-solutions/digital-spine-by-energy-web/component-guides/ddhub-client-gateway/technical-guide/authentication-and-authorization) |

Helm (EWC defaults, chart `1.3.0-ewc`):

- OCI: `oci://ewfcontainerregistry.azurecr.io/helm/ddhub-client-gateway-api`
- Chart source: [energywebfoundation/ddhub-client-gateway-helm @ v.1.3.0-ewc](https://github.com/energywebfoundation/ddhub-client-gateway-helm/tree/v.1.3.0-ewc)
- Helm repo hint: `https://ewfcontainerregistry.azurecr.io/helm/v1/repo`

## Constraints (docs + D3.1 briefing)

| Constraint | Implication |
|---|---|
| Not for public / end-user access; secured enterprise env only | Deploy in EU private network; no public Ingress for the API without control |
| One Gateway per participant | Our own CG; Message Broker via mTLS (`dsb_base_url` → `https://ddhub-ewc.energyweb.org`) |
| UI **or** system API integration (docs: typically not both) | Prefer **API-only** for Billing; keep UI admin-only / off public DNS |
| Auth strategies **disabled by default** | Enable API auth at deploy; REST uses header `x-api-key` |
| Components: UI (React), API (NestJS), Scheduler (NestJS), Storage (PostgreSQL), Key Vault | Dedicated Postgres + vault (HashiCorp Vault / Azure KV / AWS SM — OpenBao as Vault-compatible) |
| Scheduler caches/fetches/cleans messages | Billing still persists payloads as system of record (REQ-053 / A26 ≤ 7 days) |
| WebSocket uses subprotocol `ddhub-protocol` | Optional; Blooo default proposal remains **REST short polling** for workers |

## Current EWAG status (as of May 2026 report)

| Gate | Status |
|---|---|
| Onboarded | yes |
| Configured | **no** |
| Verified | **no** |

Open assumptions: **A12** (GSY topic schemas / roles), **A26** (≤ 7 day cache — REQ-053).

## Open points for EWAG

1. **Transport:** REST polling vs WebSocket (`websocket: NONE | SERVER | CLIENT` in Helm). Blooo proposal: REST short polling (`NONE`) unless EWAG requires WS.
2. **Enable API authentication** and API-key minting/rotation (docs show `x-api-key` usage, not creation flow).
3. **Retention / purge** vs scheduler `CLEANUP_MESSAGES_CRON_*` and REQ-053 / A26.
4. **Roles and topics** for INTELLIGENT (`billingInvoice` / `billingPayment`, GSY query topics).

Draft topic schemas: [`ewds-topics/`](ewds-topics/README.md).

## Deployment phases

### Phase 0 — Unblock EWAG

Send the unblock mail (Jira INT-307). Confirm CSR process, egress list, schema dialect (JSON Schema 2020-12 vs draft-07 / JSD7).

### Phase 1 — Infra (GitOps only, INT-157)

1. Namespace for CG (e.g. `int-ewds` / `ddhub`) on the EU cluster.
2. Dedicated PostgreSQL (CNPG) for CG storage — not a Billing module database.
3. OpenBao (`secret_engine: vault`) + External Secrets for vault token / DB / DID / mTLS material.
4. NetworkPolicy / egress allow-list (at least `ddhub-ewc.energyweb.org`; confirm RPC / identity cache with EWAG).
5. Wrap chart `ddhub-client-gateway-api` `1.3.0-ewc` under `deploy/` + Argo Application. **No ad-hoc `helm install`.**

Example values to pin when packaging (from EW deploy guide; adjust for Scaleway / OpenBao):

- `clientgateway.config.mtls_enabled: true`
- `clientgateway.config.dsb_base_url: https://ddhub-ewc.energyweb.org`
- `clientgateway.config.websocket: NONE` (until WS is chosen)
- Scheduler fetch / cleanup crons enabled; align cleanup with REQ-053

### Phase 2 — Enrolment

1. Fund EWC wallet (≥ 1 EWT); record Gateway DID.
2. CSR → EWF-signed mTLS certificate; configure via post-deploy mTLS guide.
3. VCs: Message Broker user; `topiccreator`; GSY subscriber roles when A12 closes.
4. Enable API auth; store `x-api-key` only in OpenBao.

### Phase 3 — Topics and Billing persistence

1. Register `billingInvoice` / `billingPayment` (and GSY channels when published).
2. Durable inbound message store in Billing (CG cache is not the system of record).
3. Purge after successful ingest; hard max **7 days** (REQ-053).

### Phase 4 — Adapter cut-over

1. Real P-DS (AC-10) and P-MKT (AC-04) adapters selected by configuration; **mock remains default**.
2. First slice: REST short-polling consumer + publish path for invoice/payment.
3. Operator alerts: broker disconnect, mTLS expiry, silence threshold (REQ-029).
4. Re-execute UAT-068 / UAT-069 / UAT-001 / UAT-070 against live CG before changing `v1_mode`.

## Proposed Blooo decisions (pending EWAG)

| Topic | Proposal |
|---|---|
| Transport | REST short polling; `websocket: NONE` initially |
| Mode | System/API integration (not human UI messaging) |
| Auth | API key required; UI not on the public internet |
| Retention | Purge after ingest; hard max 7 days |
| Hosting | Helm chart `1.3.0-ewc` on Scaleway `nl-ams`; OpenBao; GitOps only |

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

- `deploy/charts/ddhub-client-gateway/` (wrapper around OCI chart `1.3.0-ewc`)
- `deploy/argocd/dev/ddhub-client-gateway.yaml`
- `deploy/envs/dev/values-ddhub-client-gateway.yaml`

Do not commit secret values. Operator kubeconfig stays outside the repository.
