# Platform packaging (TD-7 / TD-9)

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
2. Init OpenBao once (share unseal keys offline — physical §5). Unseal on each restart until auto-unseal exists.
3. Enable KV v2 at mount `secret/`.
4. Create a least-privilege token for ESO and store it **only** on the cluster:

```bash
kubectl -n external-secrets create secret generic openbao-eso-token \
  --from-literal=token='…'   # never commit
```

5. Write module paths under `secret/data/<env>/<module>` (Stripe test keys, webhook secret, …) — still never in Git.
6. `ClusterIssuer` for Let's Encrypt (public hosts) lands when DNS + APISIX exist; cert-manager itself is enough for INT-133 packaging.

Register or refresh platform Applications from Git (INT-155 bootstrap already applies `deploy/argocd/platform/`):

```bash
kubectl apply -f deploy/argocd/platform/
```

Do not `helm install` these charts by hand outside Argo.
