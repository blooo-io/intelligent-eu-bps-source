# Deployment and configuration (INT-93)

Source views: [`docs/architecture/05-physical-architecture.md`](../architecture/05-physical-architecture.md), packaging under [`deploy/`](../../deploy/).

## Environments

| Env | Git ref | Namespaces | Mode |
|---|---|---|---|
| `local` | developer laptop | `local-apps` / `local-data` (k3d + Tilt) | Virtual + Stripe test |
| `dev` (`int`) | `develop` via Argo CD | `int-apps` / `int-data` | Virtual + Stripe test |
| `demo` | release tag, manual sync | `demo-apps` / `demo-data` | Virtual + Stripe test |

Hosting: Scaleway Kapsule, region **nl-ams**. Public hosts under `*.intelligent-eu-bp.blooo.dev`.

## GitOps

1. CI on `develop` builds, tests and pushes images to GHCR (`:<sha>` and floating `:develop`).
2. Quality analysis: workflow `sonarqube` (INT-291) — see [`sonarqube.md`](./sonarqube.md) (`SONAR_TOKEN` required to enforce the gate).
3. Argo CD Applications under `deploy/argocd/` sync Helm releases from Git.
4. Agents must not mutate the cluster ad hoc (INT-157). Investigation: `kubectl get|describe|logs` only.

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
