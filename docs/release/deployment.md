# Deployment and configuration (INT-93)

> **Audience:** this note describes the **upstream reference deployment** (example cloud region, DNS zone, Argo CD, OpenBao paths).  
> **If you are deploying your own instance**, start with the public guide instead: [`apps/site/guide/deploy.md`](../../apps/site/guide/deploy.md) (VitePress / GitHub Pages). Treat hostnames below as examples.

Source views: [`docs/architecture/05-physical-architecture.md`](../architecture/05-physical-architecture.md), packaging under [`deploy/`](../../deploy/).

## Environments

| Env | Git ref | Namespaces | Mode |
|---|---|---|---|
| `local` | developer laptop | `local-apps` / `local-data` (k3d + Tilt) | Virtual + Stripe test |
| `dev` (`int`) | `develop` via Argo CD | `int-apps` / `int-data` | Virtual + Stripe test |
| `demo` | release tag (`vX.Y.Z`, INT-305), manual sync | `demo-apps` / `demo-data` | Virtual + Stripe test |

Hosting: Scaleway Kapsule, region **nl-ams**. Public hosts under `*.intelligent-eu-bp.blooo.dev`.

## GitOps

1. CI on `develop` builds, tests and pushes images to GHCR (`:<sha>` and floating `:develop`).
2. SemVer tags (`vX.Y.Z`) trigger the `release` workflow: GitHub Release + GHCR images tagged `:vX.Y.Z` ([`VERSIONING.md`](./VERSIONING.md), INT-305).
3. Quality analysis: workflow `sonarqube` (INT-291) — see [`sonarqube.md`](./sonarqube.md) (`SONAR_TOKEN` required to enforce the gate).
4. Argo CD Applications under `deploy/argocd/` sync Helm releases from Git.
5. Agents must not mutate the cluster ad hoc (INT-157). Investigation: `kubectl get|describe|logs` only.

Bootstrap and operator scripts: `deploy/README.md`, `deploy/argocd/README.md`, `node scripts/argocd-bootstrap.mjs --print`.

## Configuration surface

| Concern | Where it lives |
|---|---|
| Per-env values | `deploy/envs/{local,dev,demo}/values.yaml` |
| Module charts | `deploy/charts/<module>/` (`replicaCount` 1 when a Dockerfile exists) |
| Secrets | OpenBao → External Secrets (`ClusterSecretStore` `openbao`); **no secret values in Git** |
| Image pull | GHCR pull secret via OpenBao seed (INT-177) |
| Image tag | Floating `develop` on `dev` (INT-178); immutable SHA also published |
| TLS | cert-manager + Let's Encrypt production issuer (INT-173) |
| IdP | Keycloak realm per environment; OIDC client for the web app |
| Gateway | APISIX routes for `app`, `api`, `auth` hosts |
| Mail | Mailpit chart on non-prod |
| Workflows | Temporal namespaces registered by GitOps Job (INT-172) |

## Database backups and alert routing (INT-358)

Source: physical view PD-4 (backups) and §7 (monitoring). Packaging: `deploy/charts/cnpg-int-data` (module databases), `deploy/platform/kube-prometheus/values.yaml` and `deploy/charts/alertmanager-slack-secret`. Details per environment: `deploy/platform/README.md`.

### OpenBao paths to seed before Argo sync

KV v2 mount `secret/`. Names only; values are never in Git and the placeholder seed script does not write them (a fake key would only make archiving fail later).

| Path | Properties | Consumer |
|---|---|---|
| `dev/cnpg-backup` | `access_key_id`, `secret_access_key` | ExternalSecret `int-data-backup-s3` (namespace `int-data`) |
| `demo/cnpg-backup` | `access_key_id`, `secret_access_key` | ExternalSecret `demo-data-backup-s3` (namespace `demo-data`) |
| `platform/alertmanager` | `slack_webhook_url` | ExternalSecret `alertmanager-slack` (namespace `observability`) |

The keys are a Scaleway API key restricted to the environment's backup bucket (`intelligent-eu-bps-backups-dev`, `intelligent-eu-bps-backups-demo`, region nl-ams). Create the buckets first. Order matters for the databases: if the Cluster syncs before the credentials exist, WAL archiving fails and WAL files accumulate on the 20 Gi data volume until the path is seeded. Alertmanager has no such ordering: its webhook Secret is an optional volume, so the stack comes up without it and only Slack sends fail (`alertmanager_notifications_failed_total`). `IntelligentExternalSecretNotReady` (INT-327) fires while any of the three paths is missing.

### Verify a backup (read-only)

```bash
# WAL archiving healthy: condition ContinuousArchiving=True
kubectl -n int-data get cluster int-data \
  -o jsonpath='{.status.conditions[?(@.type=="ContinuousArchiving")].status}{"\n"}'
# Earliest restorable point and last successful base backup
kubectl -n int-data get cluster int-data \
  -o jsonpath='{.status.firstRecoverabilityPoint}{"  "}{.status.lastSuccessfulBackup}{"\n"}'
# Daily base backups created by ScheduledBackup int-data-daily (phase completed)
kubectl -n int-data get scheduledbackup,backup
```

Use `demo-data` in namespace `demo-data` for demo. A `Backup` in phase `failed` or `ContinuousArchiving=False` usually means missing or wrong credentials or bucket. Check the ExternalSecret status first.

### Restore to a point in time (PITR)

Restores go through Git like any other change (INT-157). The chart only reads `recovery` when the Cluster is created.

1. Pick a `targetTime` (RFC 3339, UTC) between `firstRecoverabilityPoint` and now.
2. Open an `INT-xxx` pull request on the environment's values (`values.yaml` for dev, `values-demo.yaml` for demo):
   - `recovery.enabled: true` and `recovery.targetTime: "<timestamp>"`; `recovery.sourceServerName` stays the archive that wrote the backups (`int-data` / `demo-data`, or the last `backup.serverName` used).
   - `backup.serverName: <cluster>-r<N>` (a new archive folder): barman refuses to archive into a folder that already holds WAL from the old timeline.
   The chart renders `bootstrap.recovery` with `recoveryTarget.targetTime` and an `externalClusters` entry `origin` that points at the same bucket and credentials.
3. After merge, a platform operator suspends auto-sync on the Application (`dev-cnpg-int-data`), deletes the existing Cluster **and its PVCs**, then re-enables sync. Argo recreates the Cluster, CNPG restores the last base backup before `targetTime` and replays WAL up to it. The service names (`<cluster>-rw`) and the role Secrets stay the same, so modules reconnect without config changes.
4. Verify with the read-only checks above, then open a follow-up pull request that sets `recovery.enabled: false`, keeps the new `backup.serverName` and updates `recovery.sourceServerName` to the same value for the next restore. Replication slots are not part of a base backup, so Debezium Server (INT-214) recreates its slots and the outbox rows written after `targetTime` are lost with the rest of the data.

Restoring into a side Cluster for inspection (no cut-over) uses the same `bootstrap.recovery` / `externalClusters` shape under another Cluster name and is also shipped through a pull request.

## Local stack

```bash
node scripts/local-stack.mjs --check
node scripts/local-stack.mjs --up
tilt up
stripe listen --forward-to localhost:8080/webhooks/payment-provider
```

## Smoke checks (dev)

```bash
curl -fsS https://app.dev.intelligent-eu-bp.blooo.dev/health
curl -fsS https://app.dev.intelligent-eu-bp.blooo.dev/config.json
# API expects OIDC — unauthenticated call should be 401
curl -sS -o /dev/null -w '%{http_code}\n' https://api.dev.intelligent-eu-bp.blooo.dev/v1/me
```
