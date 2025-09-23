# Platform packaging (TD-7 / TD-9 / TD-10)

Application modules stay under `deploy/charts/<ac-module>/`. Shared platform pieces live here and under dedicated charts.

## Event transport (TD-7 / INT-132)

| Chart | Namespace | Role |
|---|---|---|
| `deploy/charts/nats` | `nats` (shared) | NATS JetStream; one account per environment |
| `deploy/charts/debezium-server` | `int-data` / `demo-data` | Debezium Server: PostgreSQL CDC outbox → JetStream |

Argo applications:

- `deploy/argocd/platform/nats.yaml` — shared, tracks `develop`
- `deploy/argocd/dev/debezium-server.yaml` → `int-data`
- `deploy/argocd/demo/debezium-server.yaml` → `demo-data` (manual)

`replicaCount` for Debezium stays **0** until CloudNativePG databases and OpenBao credentials exist (INT-133). Consumers remain idempotent via the NestJS module template (INT-98).

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

Register or refresh platform Applications from Git (INT-155 bootstrap already applies `deploy/argocd/platform/`):

```bash
kubectl apply -f deploy/argocd/platform/
```

Do not `helm install` these charts by hand outside Argo.
