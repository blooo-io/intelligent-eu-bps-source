# Deploy on Kubernetes

This guide describes how to run the Billing & Payment Service **on infrastructure you control**. The repository’s `deploy/` tree is a **reference packaging** (Helm + optional Argo CD). You can apply the same charts with Helm alone, Flux, or another GitOps tool.

## What you need

| Capability | Reference in repo | Your substitute |
|---|---|---|
| Kubernetes ≥ 1.28 | Scaleway Kapsule example | Any conformant cluster (EU-hosted recommended for personal data) |
| Container images | GHCR builds from CI | Build with `scripts/module-images.mjs` and push to **your** registry |
| PostgreSQL | CloudNativePG charts | Managed Postgres or your operator — **one database (and user) per module** |
| NATS JetStream + Debezium | `deploy/` platform charts | Equivalent CDC → JetStream (or compatible) path |
| Temporal | Platform chart | Your Temporal cluster / namespace |
| OIDC IdP | Keycloak chart | Keycloak, or another OIDC provider with compatible claims |
| Secrets | OpenBao + External Secrets | HashiCorp Vault, cloud KMS, sealed secrets, etc. |
| Ingress / gateway | APISIX | APISIX, or another gateway that can terminate OIDC and route `/v1` |
| TLS | cert-manager | Your certificates |

## High-level steps

### 1. Build and publish images

From a clean checkout:

```bash
# Example: build module images (see script flags for selective builds)
node scripts/module-images.mjs --help
```

Tag and push images to a registry your cluster can pull. Update Helm values (`image.repository` / `image.tag`) accordingly — do **not** assume the upstream GHCR names.

### 2. Provision data stores

Create **one PostgreSQL database per NestJS module** (participants, settlement, invoicing, …). Point each module’s `DATABASE_URL` (or chart secret) at its database. Shared databases across modules violate the architecture (TP-7 / module boundaries).

### 3. Install platform dependencies

Install (or reuse) NATS JetStream, Debezium Server (or equivalent outbox publisher), Temporal, your IdP, and a secrets mechanism. The manifests under `deploy/platform/` and `deploy/charts/` show working defaults you can copy or re-home.

### 4. Install module charts

Each service has a chart under `deploy/charts/<module>/`. Typical flow with Helm:

```bash
helm upgrade --install participants deploy/charts/participants \
  -n billing-apps --create-namespace \
  -f path/to/your-values.yaml
```

Repeat for the modules you enable. Set `replicaCount` ≥ 1 only when the image exists.

### 5. Wire the gateway and web app

- Expose the **public API** (`/v1`) through your gateway with OIDC validation.
- Serve `apps/web` (or your own UI) against that public API only.
- Configure CORS and redirect URIs for your IdP client.

### 6. Smoke test

```bash
curl -fsS https://<your-app-host>/health
curl -fsS https://<your-app-host>/config.json
# Unauthenticated API call should be 401
curl -sS -o /dev/null -w '%{http_code}\n' https://<your-api-host>/v1/me
```

## Environments

Use whatever promotion model you prefer (dev → staging → prod). The reference tree uses names like `local` / `dev` / `demo` — rename freely in your values files.

## Reference deployment (optional)

The upstream project maintains a **sample** GitOps deployment (Argo CD, specific DNS zone, OpenBao paths). That is documented in the repository under [`docs/release/deployment.md`](https://github.com/blooo-io/intelligent-eu-bps-source/blob/develop/docs/release/deployment.md) and [`deploy/README.md`](https://github.com/blooo-io/intelligent-eu-bps-source/blob/develop/deploy/README.md). Treat hostnames, cloud accounts and internal processes there as **examples**, not requirements for your installation.

## Next

- [Configuration](./configuration)
- [Security & secrets](./security)
- [Adapters & integrations](./adapters)
