# DDHub Client Gateway — cluster packaging (INT-308)

Phase 1 GitOps packaging for the Blooo EWDS / DDHub Client Gateway (NFR-017). Live adapter cut-over stays later (INT-310 / INT-311). Mocks remain the V1 default (A32).

## Licence (TP-2)

Upstream Client Gateway **images** ship under **GPL-3.0**. Accepted as a **separate unmodified service** exception (same packaging rule as OpenBao and SonarQube Community): we run the public images; Billing never links the GPL code. Our deploy chart is Blooo-authored manifests with init `migration:run -d ormconfig.js` (upstream Helm `1.3.0-ewc` typeorm verb is incompatible with typeorm 0.3).

## Pieces

| Piece | Upstream / chart (pinned) | Namespace | Argo Application | Sync wave |
|---|---|---|---|---|
| CG database (CNPG) | local `deploy/charts/cnpg-ddhub` (ESO Password generator) | `ddhub` | `platform-cnpg-ddhub` | 1 |
| Gateway secret + NetworkPolicy | local `deploy/charts/ddhub-gateway-secret` | `ddhub` | `platform-ddhub-gateway-secret` | 2 |
| Client Gateway API (+ scheduler) | local `deploy/charts/ddhub-client-gateway` (images `intelligent-canary`) | `ddhub` | `platform-ddhub-client-gateway` | 3 |

Values: `deploy/platform/ddhub-client-gateway/values.yaml`.

Phase 1 flags: `MTLS_ENABLED=false`, `USER_AUTH_ENABLED=false`, no UI Deployment, no Ingress, `WEBSOCKET=NONE`. Enrolment / mTLS / API keys = INT-309.

## Secrets

| Source | Keys |
|---|---|
| CNPG + ESO Password → Secret `ddhub` | `username` / `password` (role) |
| OpenBao `platform/ddhub` | `vault_token` (CG → OpenBao for DID keys) |
| ExternalSecret → `ddhub-client-gateway-secret` | `DB_NAME` (URI), `VAULT_TOKEN` |

Never commit secret values.

## Operator steps after merge (INT-157)

1. Ensure platform Applications exist:

```bash
kubectl apply -f deploy/argocd/platform/
```

2. Seed OpenBao placeholders (includes `platform/ddhub` vault_token placeholder):

```bash
KUBECONFIG=… node scripts/openbao-seed-dev-placeholders.mjs --apply
```

3. Enable KV v1 mount `ddhub/` and mint a CG token (required — the app writes `ddhub/mnemonic`, not under `secret/`):

```bash
KUBECONFIG=… node scripts/openbao-seed-ddhub-cg.mjs --apply
```

4. Wait until `platform-cnpg-ddhub` and `platform-ddhub-client-gateway` are Healthy:

```bash
kubectl -n ddhub get pods,externalsecret,cluster
kubectl -n ddhub port-forward svc/ddhub-client-gateway 3333:80
# GET /api/v2/health
```

Do not `helm install` by hand outside Argo.
