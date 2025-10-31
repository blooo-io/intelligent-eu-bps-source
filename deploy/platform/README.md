# Platform packaging (TD-3 / TD-6 / TD-7 / TD-8 / TD-9 / TD-10 / IdP)

Application modules stay under `deploy/charts/<ac-module>/`. Shared platform pieces live here and under dedicated charts.

## Workflows (TD-3 / INT-159)

| Piece | Upstream / chart (pinned) | Namespace | Argo Application | Sync wave |
|---|---|---|---|---|
| Temporal DB (CNPG) | local `deploy/charts/cnpg-temporal` | `temporal` | `platform-cnpg-temporal` | 1 |
| Temporal server + UI | `temporal` **1.7.0** (MIT) | `temporal` | `platform-temporal` | 2 |
| Temporal namespaces `int` / `demo` | local `deploy/charts/temporal-namespaces` | `temporal` | `platform-temporal-namespaces` | 3 |

Values: `deploy/platform/temporal/values.yaml`. SQL on CNPG (`temporal` + `temporal_visibility`); role password via ESO Password generator → Secret `temporal` (`refreshInterval: "0"`, create once). `numHistoryShards: 1` for V1 / virtual `dev` (immutable after init). Namespaces are registered by an idempotent Job (`temporalio/admin-tools`) against `platform-temporal-frontend:7233` (INT-172). Depends on CNPG operator (INT-158).

## API gateway (TD-8 / INT-161)

| Piece | Upstream / chart (pinned) | Namespace | Argo Application | Sync wave |
|---|---|---|---|---|
| APISIX Admin ExternalSecret | local `deploy/charts/apisix-admin-secret` | `ingress` | `platform-apisix-admin-secret` | 2 |
| Apache APISIX + Ingress Controller | `apisix` **2.12.4** (Apache-2.0) | `ingress` | `platform-apisix` | 3 |

Values: `deploy/platform/apisix/values.yaml`. Admin API keys from OpenBao path `platform/apisix` (seed placeholders `admin` / `viewer`). Built-in etcd is **V1 / virtual `dev` only** (`replicaCount: 1`). Gateway Service is LoadBalancer; public DNS (`api.<env>.intelligent-eu-bp.blooo.dev`), OIDC routes and the Stripe webhook path land on INT-114. Depends on ESO + OpenBao store (INT-133).

## API gateway routes (TD-8 / INT-114)

| Piece | Chart | Namespace | Argo Application | Sync wave |
|---|---|---|---|---|
| Let's Encrypt ClusterIssuer | local `deploy/charts/letsencrypt-issuer` | `cert-manager` | `platform-letsencrypt-issuer` | 3 |
| Public ApisixRoutes + ExternalName backends | local `deploy/charts/apisix-gateway` | `ingress` | `dev-apisix-gateway` | 4 |

Env hosts: `deploy/envs/<env>/apisix-gateway-values.yaml`. Webhook `POST /webhooks/payment-provider` is rate-limited and unauthenticated; `/v1/*` uses `openid-connect` (Keycloak realm per env; `client_secret` via ExternalSecret `apisix-oidc`, INT-169). Depends on platform APISIX (INT-161) and Keycloak (INT-160). TLS (INT-168 / INT-173 / INT-174): `Certificate` + `ApisixTls` per host; issuer `letsencrypt-prod` (`useProduction: true`). Staging ClusterIssuer remains for debug. After an issuer flip, bump `tls.reloadGeneration` so ApisixTls is replaced and APISIX etcd reloads `tls.crt` (Secret-only updates can leave a stale SSL object).

## Databases (TD-6 / INT-158)

| Piece | Upstream / chart (pinned) | Namespace | Argo Application | Sync wave |
|---|---|---|---|---|
| CloudNativePG operator | `cloudnative-pg` **0.29.1** (Apache-2.0) | `cnpg-system` | `platform-cloudnative-pg` | 0 |
| `int-data` Cluster + DBs | local `deploy/charts/cnpg-int-data` | `int-data` | `dev-cnpg-int-data` | 1 |

Values: `deploy/platform/cloudnative-pg/values.yaml`. One PostgreSQL database and login role per NestJS module (`trade_intake`, `reference_data`, …). Role passwords are created once by the ESO Password generator into `kubernetes.io/basic-auth` Secrets (referenced by `passwordSecret`) — never in Git. Object Storage backups (PD-4) wait on Scaleway bucket + OpenBao path. `demo-data` Application stays manual (`deploy/argocd/demo/cnpg-demo-data.yaml`).

## Identity (INT-160)

| Piece | Upstream / chart (pinned) | Namespace | Argo Application | Sync wave |
|---|---|---|---|---|
| Keycloak DB (CNPG) | local `deploy/charts/cnpg-keycloak` | `keycloak` | `platform-cnpg-keycloak` | 1 |
| Keycloak admin ExternalSecret | local `deploy/charts/keycloak-admin-secret` | `keycloak` | `platform-keycloak-admin-secret` | 2 |
| Keycloak.X | `keycloakx` **7.4.0** (`quay.io/keycloak/keycloak`) | `keycloak` | `platform-keycloak` | 2 |

Values: `deploy/platform/keycloak/values.yaml`. DB password comes from the CNPG-managed Secret `keycloak`. Admin bootstrap password comes from OpenBao path `platform/keycloak` (seed placeholder `password=dev-only-replace-me`). Realms `int` / `demo` (clients `apisix-gateway`, `web`) import from ConfigMap `keycloak-realm-import` (INT-169; client secret matches OpenBao `platform/apisix` `oidc_client_secret`). Public host `auth.intelligent-eu-bp.blooo.dev` is routed by APISIX (INT-114). Depends on CNPG operator (INT-158).

## Event transport (TD-7 / INT-132)

| Chart | Namespace | Role |
|---|---|---|
| `deploy/charts/nats` | `nats` (shared) | NATS JetStream; one account per environment |
| `deploy/charts/debezium-server` | `int-data` / `demo-data` | Debezium Server: PostgreSQL CDC outbox → JetStream |

Argo applications:

- `deploy/argocd/platform/nats.yaml` — shared, tracks `develop`
- `deploy/argocd/dev/debezium-server.yaml` → `int-data`
- `deploy/argocd/demo/debezium-server.yaml` → `demo-data` (manual)

`replicaCount` for Debezium stays **0** until CloudNativePG databases (INT-158) and OpenBao credentials exist (INT-133). Consumers remain idempotent via the NestJS module template (INT-98).

NACK operator (full CRD lifecycle) can replace the StatefulSet later without changing the NATS service DNS `nats.nats.svc.cluster.local:4222` expected by module NetworkPolicies.

## Secrets and certificates (TD-9 / INT-133)

Official Helm charts (not vendored into this repo). Values only in Git; no secret values.

| Piece | Upstream chart (pinned) | Namespace | Argo Application | Sync wave |
|---|---|---|---|---|
| External Secrets Operator | `external-secrets` **2.13.0** (Apache-2.0) | `external-secrets` | `platform-external-secrets` | 0 |
| cert-manager | `cert-manager` **v1.21.2** (Apache-2.0) | `cert-manager` | `platform-cert-manager` | 1 |
| OpenBao | `openbao` **0.30.4** (MPL-2.0 exception) | `openbao` | `platform-openbao` | 1 |
| ClusterSecretStore `openbao` | local `deploy/charts/openbao-store` | cluster-scoped | `platform-openbao-store` | 2 |

Values files:

- `deploy/platform/external-secrets/values.yaml`
- `deploy/platform/cert-manager/values.yaml`
- `deploy/platform/openbao/values.yaml`

Module and NATS/Debezium charts already declare `ExternalSecret` → `ClusterSecretStore` / `openbao` with path `<env>/<module>` (NFR-005).

### Operator steps after the Argo apps sync (not in Git)

1. Confirm ESO CRDs: `kubectl get crd | grep external-secrets`.
2. **V1 / `dev` (virtual Stripe-test):** single-share OpenBao init — no Shamir multi-person ceremony:

```bash
node scripts/openbao-dev-bootstrap.mjs --check
node scripts/openbao-dev-bootstrap.mjs --print
KUBECONFIG=… node scripts/openbao-dev-bootstrap.mjs --apply
```

   That runs `bao operator init -key-shares=1 -key-threshold=1`, stores the one unseal key + root token in cluster Secret `openbao/openbao-dev-bootstrap`, unseals, enables KV v2 at `secret/`, and writes `external-secrets/openbao-eso-token` for `ClusterSecretStore` `openbao`. Nothing of that goes into Git.

   After an OpenBao pod restart, unseal again from that cluster Secret (see `--print`).

   **Demo / stronger custody later:** multi-share offline keys per physical §5 — out of scope for V1 virtual `dev`.

3. Seed KV placeholders so ExternalSecrets can sync (V1 only — field `seeded=true`, no real secrets). Run only from a **merged** branch (INT-157):

```bash
KUBECONFIG=… node scripts/openbao-seed-dev-placeholders.mjs --apply
```

   Replace those paths later with Stripe test keys / webhook secret under `secret/data/<env>/<module>` — still never in Git.

4. `ClusterIssuer` for Let's Encrypt (public hosts) lands when DNS + APISIX exist; cert-manager itself is enough for INT-133 packaging.

## Observability (TD-10 / INT-134)

100 % Apache-2.0 stack. **Grafana is not packaged** (AGPL — TD-10). Namespace: `observability` (physical § namespaces).

| Piece | Upstream chart (pinned) | Argo Application | Sync wave |
|---|---|---|---|
| Prometheus + kube-prometheus | `kube-prometheus-stack` **92.10.0** | `platform-kube-prometheus` | 0 |
| Jaeger (traces) | `jaeger` **4.16.1** | `platform-jaeger` | 1 |
| VictoriaLogs (logs) | `victoria-logs-single` **0.13.10** | `platform-victoria-logs` | 1 |
| OpenTelemetry Collector | `opentelemetry-collector` **0.176.0** | `platform-otel-collector` | 2 |
| Perses (dashboards) | `perses` **0.23.3** | `platform-perses` | 2 |

Values files:

- `deploy/platform/kube-prometheus/values.yaml` — `grafana.enabled: false`
- `deploy/platform/jaeger/values.yaml` — in-memory storage for V1 / virtual `dev`
- `deploy/platform/victoria-logs/values.yaml`
- `deploy/platform/otel-collector/values.yaml` — OTLP in; traces→Jaeger, logs→VictoriaLogs, metrics scrape endpoint; attributes redaction (NFR-015)
- `deploy/platform/perses/values.yaml` — ClusterIP; UI via port-forward until APISIX + Keycloak
- `deploy/platform/apisix/values.yaml` — LoadBalancer; Admin keys via ExternalSecret; Ingress Class `apisix`

Register or refresh platform Applications from Git (INT-155 bootstrap already applies `deploy/argocd/platform/`):

```bash
kubectl apply -f deploy/argocd/platform/
```

Do not `helm install` these charts by hand outside Argo.
