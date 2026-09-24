# Configuration

Modules are configured through **environment variables** and Kubernetes values. Secrets must never be committed to Git.

## Common patterns

| Concern | Typical variable / value key | Notes |
|---|---|---|
| HTTP port | `PORT` | Chart service port |
| Database | `DATABASE_URL` | One DB per module |
| Public base URL | `PUBLIC_BASE_URL` / web `config.json` | Browser-facing origin |
| OIDC | Issuer URL, client id, audience | Must match gateway + web app |
| Stripe | `STRIPE_SECRET_KEY`, webhook secret | Test mode for V1 |
| NATS | `NATS_URL` | JetStream enabled |
| Temporal | Host / namespace | Scheduler workers |
| Adapter mode | e.g. `PSP_PROVIDER`, market/EWDS flags | `mock` vs real implementation |

Exact keys live in each chart’s `values.yaml` and module README under `services/<module>/`.

## Per-environment values

Copy the structure of `deploy/envs/` as a starting point:

1. Create `values-<your-env>.yaml` with image registry, replica counts, ingress hosts, and secret references.
2. Keep **secret values** in your secret manager; mount them as Kubernetes Secrets or envFrom.
3. Document your own hostnames — do not hard-code upstream demo DNS.

## Web app config

The reference UI loads a small JSON config (API base URL, OIDC client settings). Generate it from your chart or ConfigMap so the same image can run in multiple environments.

## Feature and adapter switches

Business integrations are behind **ports** (hexagonal adapters). Prefer configuration to select:

- Stripe vs mock PSP
- Mock market / EWDS vs real gateways
- Mail catcher vs real SMTP

See [Adapters](./adapters).
