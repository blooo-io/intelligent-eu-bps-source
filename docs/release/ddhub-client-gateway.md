# DDHub Client Gateway — cluster packaging (INT-308)

Phase 1 GitOps packaging for the Blooo EWDS / DDHub Client Gateway (NFR-017). Live adapter cut-over stays later (INT-310 / INT-311). Mocks remain the V1 default (A32).

## Licence (TP-2)

Upstream `ddhub-client-gateway` / Helm chart ship under **GPL-3.0**. Accepted as a **separate unmodified service** exception (same packaging rule as OpenBao and SonarQube Community): official OCI chart only, never linked into Nest modules. See TD-1 in `docs/architecture/04-technical-architecture.md`.

## Pieces

| Piece | Upstream / chart (pinned) | Namespace | Argo Application | Sync wave |
|---|---|---|---|---|
| CG database (CNPG) | local `deploy/charts/cnpg-ddhub` | `ddhub` | `platform-cnpg-ddhub` | 2 |
| Gateway secret + NetworkPolicy | local `deploy/charts/ddhub-gateway-secret` | `ddhub` | `platform-ddhub-gateway-secret` | 2 |
| Client Gateway API (+ scheduler) | OCI `ddhub-client-gateway-api` **1.3.0-ewc** | `ddhub` | `platform-ddhub-client-gateway` | 3 |

Values: `deploy/platform/ddhub-client-gateway/values.yaml`.

Phase 1 flags: `mtls_enabled: false`, `USER_AUTH_ENABLED: "false"`, `ui.enabled: false`, `ingress.enabled: false`, `websocket: NONE`. Enrolment / mTLS / API keys = INT-309.

## OpenBao path

`secret/platform/ddhub` (KV v2):

| Property | Role |
|---|---|
| `db_password` | CNPG role `ddhub` + URI password in `DB_NAME` |
| `vault_token` | CG → OpenBao (`VAULT_TOKEN`) for DID key storage under prefix `ddhub/` |
| `seeded` | V1 placeholder marker |

Kubernetes Secret `ddhub-client-gateway-secret` (keys `DB_NAME`, `VAULT_TOKEN`) is built by ExternalSecret — never commit values.

## Operator steps after merge (INT-157)

1. Seed placeholders (merged branch only):

```bash
KUBECONFIG=… node scripts/openbao-seed-dev-placeholders.mjs --apply
```

2. Register platform Applications if needed:

```bash
kubectl apply -f deploy/argocd/platform/
```

3. Replace placeholders with a real DB password and an OpenBao token that can read/write `secret/data/ddhub/*` (policy for CG). Do **not** put those values in Git:

```bash
# Example shape only — generate your own password/token offline
bao kv put -mount=secret platform/ddhub \
  db_password='…' \
  vault_token='…' \
  seeded=true
```

4. Wait until `platform-cnpg-ddhub` and `platform-ddhub-client-gateway` are Healthy. Probe in-cluster only:

```bash
kubectl -n ddhub get pods,svc,externalsecret
kubectl -n ddhub port-forward svc/ddhub-client-gateway 3333:80
# then GET /api/v2/health on localhost
```

Do not `helm install` the OCI chart by hand outside Argo.
