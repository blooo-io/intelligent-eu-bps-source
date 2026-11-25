# Configuration

Modules are configured through **environment variables** and Kubernetes values. Secrets must never be committed to Git.

## Common patterns

| Concern | Typical variable / value key | Notes |
|---|---|---|
| HTTP port | `PORT` | Chart service port |
| Database | `DATABASE_URL` | One DB per module |
| Public base URL | `PUBLIC_BASE_URL` / web `config.json` | Browser-facing origin |
| OIDC | Issuer URL, client id, audience | Must match gateway + web app |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Test or live keys **per community** |
| NATS | `NATS_URL` | JetStream enabled |
| Temporal | Host / namespace | Scheduler workers |
| CGW | `CGW_BASE_URL`, `CGW_API_KEY` (OpenBao) | Never inline the API key in Helm values |

Exact keys live in each chart’s `values.yaml` and module README under `services/<module>/`.

## EWDS adapter flags (A8)

| Variable | Values | Default (code / chart) | Deployed envs |
|---|---|---|---|
| `MARKET_ADAPTER` | `mock` \| `ewds` | `mock` | `ewds` |
| `DATASPACE_ADAPTER` | `mock` \| `ewds` | `mock` | `ewds` |
| `ACTOR_SOURCE_ADAPTER` | `mock` \| `ewds` | `mock` | `ewds` |
| `ERASURE_SOURCE_ADAPTER` | `mock` \| `ewds` | `mock` | `ewds` |
| `TARIFF_ADAPTER` | `mock` \| `ewds` | `mock` | `ewds` |
| `COMMAND_CHANNEL_ENABLED` | `true` \| `false` | `false` | `true` |

Any other value fails at boot. Local development and unit tests keep the mock defaults. See [Adapters](./adapters).

## Per-environment values

Copy the structure of `deploy/envs/` as a starting point:

1. Create `values-<your-env>.yaml` with image registry, replica counts, ingress hosts, and secret references.
2. Keep **secret values** in your secret manager; mount them as Kubernetes Secrets or envFrom.
3. Document your own hostnames — do not hard-code upstream demo DNS.

## Web app config

The reference UI loads a small JSON config (API base URL, OIDC client settings). Generate it from your chart or ConfigMap so the same image can run in multiple environments. `/v1` is for this reference client only; the project UI uses EWDS.

## Feature and adapter switches

Business integrations are behind **ports** (hexagonal adapters). Prefer configuration to select:

- Stripe vs mock PSP
- Mock market / EWDS vs real Client Gateway (`MARKET_ADAPTER`, `DATASPACE_ADAPTER`, …)
- Command channel on/off (`COMMAND_CHANNEL_ENABLED`)
- Mail catcher vs real SMTP

See [Adapters](./adapters).
