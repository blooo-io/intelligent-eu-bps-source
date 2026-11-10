---
title: Billing & Payment Service — Physical architecture
view: physical
iteration: 5
status: validated
version: "1.0"
date: 2026-10-08
baseline: 04-technical-architecture.md v1.0 (validated 2026-10-07); 03
  application v1.0; requirements v5; assumptions A1–A33
---
# Billing & Payment Service: physical architecture

> **View 5 of 5** (functional → logical → application → technical → **physical**, see [README](README.md)).
> This view answers: **where and how the components of the technical view run**: hosting, environments, cluster topology, network exposure, storage, backups and operations.
> Status: **validated (2026-10-08)**. Deployed-state correction (2026-11-10, INT-374): §3 shows the running cluster. The cloud environment is `dev` (namespaces `int-*`). `demo` is not deployed. CNPG backups are not configured. The apps namespace runs 13 back-end modules (AC-03…AC-15), not 15. Prometheus retention on `dev` is 2 days.

## 1. Decisions framing this view

| # | Decision | Source |
|---|---|---|
| PD-1 | **Hosting: Scaleway** (French provider, not subject to the US CLOUD Act). **Everything runs in the Amsterdam region (nl-ams)**: the managed Kubernetes cluster (**Kapsule**, since capacity is no longer available in Paris), block storage and Object Storage. The Netherlands is in the EU, so NFR-002 is met. **No multi-zone requirement for V1**: these are non-production environments. | 2026-10-08; NFR-002 |
| PD-2 | **Environments for V1:** `local` (developer laptop, k3d + Tilt), **`dev`** (automatic deployment on every merge to `develop`; namespaces `int-apps` and `int-data`) and **`demo`** (stable version for partners and pilots, packaged in Git, **not deployed**). `dev` runs in **virtual mode with Stripe test**. There is no production environment before the first live community. | 2026-10-07; A32; naming and deploy state 2026-11-10 |
| PD-3 | **One managed cluster for V1**, with one set of namespaces per environment, NetworkPolicies and resource quotas. Production will get its own cluster later. | 2026-10-07 |
| PD-4 | **Backups (target):** CloudNativePG continuous backup (WAL archiving + daily base backup) to **Scaleway Object Storage in nl-ams** (same region, separate bucket per environment), with **point-in-time recovery**. Retention is 7 days on `dev` and 30 days on `demo`. For non-production, the risk that a regional incident affects both the cluster and its backups is accepted. Production will add a second region. **Not configured** on the deployed cluster: `backup.enabled: false` until the buckets and OpenBao paths exist (INT-358). §3 does not draw a backup path. | 2026-10-08; disabled state INT-358 |
| PD-5 | **Domain:** all public hosts live under **`intelligent-eu-bp.blooo.dev`** (§4). | 2026-10-08 |

## 2. Provider selection criteria (PD-1 closed: Scaleway)

These criteria were used to choose the provider. They stay valid for the future production cluster.

| Criterion | Requirement |
|---|---|
| Jurisdiction | EU-headquartered provider, data centres in France/EU, GDPR DPA available |
| Managed Kubernetes | Upstream-conformant (CNCF certified), current Kubernetes versions, autoscaling node pools, free or cheap control plane |
| Storage | Block storage with encryption at rest and CSI snapshots; S3-compatible object storage with encryption and versioning in another zone |
| Network | Managed load balancer, private network between nodes, egress to Stripe |
| Security | Encryption at rest, IAM for cluster access, audit logs |
| Certifications | ISO 27001 at least (HDS / SecNumCloud not required for billing data) |
| Cost | Fits the V1 sizing of §6 within the project budget |
| Blooo fit | Existing accounts, billing and operating habits at Blooo |

## 3. Cluster topology

```mermaid
%% elk %%
flowchart TB
  subgraph Region[Scaleway region nl-ams - Amsterdam]
    subgraph Cluster[Kapsule cluster]
      subgraph Shared[Shared platform namespaces]
        ING[ingress - APISIX Ingress Controller]
        OPS[argocd, cert-manager, external-secrets, cnpg-system]
        SEC[openbao]
        IDP[keycloak - realm int]
        WF[temporal - namespace dev]
        MSG[nats - account dev]
        OBS[observability - OTel, Prometheus retention 2d, Jaeger, VictoriaLogs, Perses]
      end
      subgraph Dev[dev - namespaces int-apps and int-data]
        IAPP[int-apps - web app, 13 modules AC-03 to AC-15, Mailpit]
        IDATA[int-data - CNPG cluster, Debezium Server, backups off]
      end
    end
  end
  LB((Scaleway load balancer)) --> ING
  ING --> IAPP
```

| Namespace | Content | Shared or per env |
|---|---|---|
| `ingress` | APISIX + Ingress Controller (routes per host) | Shared |
| `argocd`, `cert-manager`, `external-secrets`, `cnpg-system` | Operators and GitOps | Shared |
| `openbao` | OpenBao (paths per env and per module) | Shared |
| `keycloak` | Keycloak, realm `int` for `dev`. A `demo` realm file is packaged and is not a deployed environment. Its database is in a CNPG cluster | Shared instance |
| `temporal` | Temporal server, namespace for `dev`; its database is in CNPG | Shared instance |
| `nats` | NATS JetStream, account for `dev` | Shared instance |
| `observability` | OTel Collector, Prometheus, Jaeger, VictoriaLogs, Perses. Prometheus retention on `dev` is **2 days** / 5 GB (INT-331) | Shared |
| `int-apps` | AC-01 web app and the **13 back-end modules** AC-03…AC-15 (NestJS modules, Temporal workers, mock suite), plus Mailpit. AC-02 is the gateway in `ingress` | `dev` |
| `int-data` | CNPG cluster (one database per module), Debezium Server. Backups are **not configured** | `dev` |

`demo-apps` and `demo-data` are packaged (`deploy/argocd/demo`, `deploy/envs/demo`) and **not deployed**. Shared platform services isolate `dev` with their native mechanisms (realm, Temporal namespace, NATS account, OpenBao path).

## 4. Network exposure

```mermaid
%% elk %%
flowchart LR
  USER([Users - browsers]) --> DNS{{*.intelligent-eu-bp.blooo.dev - TLS cert-manager}}
  STRIPE((Stripe test)) --> DNS
  DNS --> LB((Scaleway load balancer))
  LB --> APX[APISIX]
  APX --> WEB[web app]
  APX --> API[public API /v1]
  APX --> HOOK[/webhooks/payment-provider/]
  APX --> KC[Keycloak login]
  API --> MODS[modules - private]
  HOOK --> PAY[AC-07 Payments - private]
  MODS -- egress HTTPS --> STRIPE
```

Base domain: **`intelligent-eu-bp.blooo.dev`**. In the table, `<env>` is `dev` for the deployed environment. `demo` hosts are not served while `demo` is not deployed.

| Public host | Target | Notes |
|---|---|---|
| `app.<env>.intelligent-eu-bp.blooo.dev` | AC-01 web app | Static front end |
| `api.<env>.intelligent-eu-bp.blooo.dev` | APISIX → public API `/v1` | OIDC bearer required |
| `api.<env>.intelligent-eu-bp.blooo.dev/webhooks/payment-provider` | AC-07 | Only unauthenticated route: Stripe signature verified, rate-limited. Registered as the webhook endpoint in each Stripe test account |
| `auth.intelligent-eu-bp.blooo.dev` | Keycloak (realm `int` for `dev`) | Login pages and OIDC endpoints |
| `docs.intelligent-eu-bp.blooo.dev` | Redocly API documentation, Prism mock for R2M | Public contract (D5.5 is PU) |
| `sonar.intelligent-eu-bp.blooo.dev` | SonarQube Community Build (INT-292) | CI quality gate + UI; Sonar token/login (not Keycloak OIDC) |
| `ops.intelligent-eu-bp.blooo.dev` | Argo CD, Perses, Jaeger (via APISIX) | Keycloak login, Blooo operators only |

DNS: in the `blooo.dev` zone, the records of `*.intelligent-eu-bp.blooo.dev` point to the Scaleway load balancer of the cluster. cert-manager issues one Let's Encrypt certificate per host (HTTP-01 challenge). A wildcard certificate (DNS-01) is possible later if the DNS provider of `blooo.dev` offers an API.

- **Everything else is private**: modules, databases, NATS, Temporal, OpenBao, observability. Operators access the observability UIs and Argo CD through an authenticated route (Keycloak) or port-forward.
- **Egress:** Stripe API (HTTPS). Mail goes to Mailpit inside the cluster, so no external mail in V1. ECB and EWDS are mocked in V1.
- **TLS:** cert-manager certificates (Let's Encrypt) on every public host.

## 5. Storage, backups and recovery

| Data | Storage | Backup | Recovery objective (V1) |
|---|---|---|---|
| Module databases (`dev`) | CNPG cluster: 1 instance in `int-data`; encrypted block volume | **Not configured** (`backup.enabled: false`, INT-358). Target remains PD-4: WAL + daily base backup to Object Storage (nl-ams), PITR, 7 days on `dev` / 30 days on `demo` | Target RPO ≈ 5 min, RTO ≈ 1 h once backups are on |
| Keycloak, Temporal databases | CNPG clusters in their namespaces | Same packaged path, not configured on the cluster | Same |
| OpenBao | Integrated storage (Raft) on encrypted volumes | Daily Raft snapshot to Object Storage (nl-ams), 30 days; unseal keys held offline by two Blooo people | RTO ≈ 2 h |
| NATS JetStream | Persistent volumes | No backup: events are rebuilt from the module outboxes or replayed | — |
| Observability data | Persistent volumes | No backup. Prometheus on `dev`: **2 days** / 5 GB (INT-331). VictoriaLogs retention: 1 month | — |
| Configuration | Git (helmfile + Argo CD) | Git hosting | Re-deploy from Git |
| Container images | GitHub Container Registry (images contain no data or secrets) | Rebuilt from Git tags | — |

A **restore test** is run before the first partner demo, then every quarter.

## 6. Sizing (from technical view §8)

| Item | Estimate |
|---|---|
| Per environment (apps + data) | ≈ 4–5 vCPU / 8–12 GB RAM |
| Shared platform (ingress, Keycloak, Temporal, NATS, OpenBao, operators, observability) | ≈ 4–6 vCPU / 10–14 GB RAM |
| **Node pool** | **3 nodes × 8 vCPU / 16 GB** (24 vCPU / 48 GB) in nl-ams, single zone; autoscaling 3 → 5 nodes |
| Block storage | ≈ 300 GB (databases, NATS, OpenBao, observability) |
| Object storage | ≈ 100–200 GB (backups, nl-ams) |

These figures are estimates and will be adjusted after the first load test on `dev`.

## 7. Operations

| Topic | Design |
|---|---|
| Deployment | GitHub Actions builds, tests and pushes images. Argo CD syncs helmfile-rendered manifests: `dev` follows `develop`. `demo` follows a release tag and is not deployed. |
| Cluster access | Scaleway IAM for cluster administration. Day-to-day work goes through Argo CD; `kubectl` access is limited to named Blooo operators. |
| Secrets | OpenBao is the source of truth and ESO syncs secrets per namespace. Stripe test keys and the webhook secret differ per environment. |
| Monitoring and alerts | Prometheus alert rules: workload health, job failures (`JobFailed`), intake anomalies, reconciliation discrepancies, Stripe webhook rejections, certificate expiry, backup failures, disk usage. **Alertmanager** (Apache-2.0, part of the Prometheus stack) sends the alerts to a **dedicated Blooo Slack channel** (name and webhook to be defined), with the `dev` environment label. Prometheus retention on `dev` is 2 days (INT-331). |
| Updates | Monthly patching of the platform components through Argo CD; Dependabot for application dependencies; the Kapsule Kubernetes version follows Scaleway's support window. |
| Data reset (demo) | Scripted reset of the `demo` data and Stripe test objects between demo campaigns. |

## 8. Open points
- Scaleway project and account set-up at Blooo; Kapsule cluster and Object Storage buckets in nl-ams.
- DNS records for `*.intelligent-eu-bp.blooo.dev` in the `blooo.dev` zone.
- Name of the Slack alert channel and its incoming webhook (stored in OpenBao).
- **Future production:** a dedicated cluster (Stripe live, first live community), multiple zones, backups in a second region. When the EWDS adapter becomes real, the egress and mTLS set-up to the EWF Message Broker for the Blooo Client Gateway (NFR-017).

## 9. Validation checklist
- [ ] Hosting decision and selection criteria
- [ ] Environments `local` / `dev` (`int-*`) / `demo` packaged, not deployed
- [ ] One cluster with namespaces per environment; shared platform with per-env isolation
- [ ] Network exposure (public hosts, private everything else)
- [ ] Backups and recovery objectives
- [ ] Sizing and node pool
- [ ] Operations
