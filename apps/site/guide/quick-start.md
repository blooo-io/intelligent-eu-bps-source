# Quick start (local)

Goal: run tests and inspect contracts on a developer machine without a full cluster.

## Prerequisites

- **Node.js** ≥ 22 ([`.nvmrc`](https://github.com/blooo-io/intelligent-eu-bps-source/blob/develop/.nvmrc))
- **pnpm** 9 (see `packageManager` in the root `package.json`)
- Git

Optional for a full local cluster: Docker, [k3d](https://k3d.io), [Tilt](https://tilt.dev), Stripe CLI.

## Clone and install

```bash
git clone https://github.com/blooo-io/intelligent-eu-bps-source.git
cd intelligent-eu-bps-source
pnpm install
```

## Validate contracts

```bash
pnpm run contracts:lint
```

This runs Spectral, Redocly and AsyncAPI validate against `contracts/`.

## Run the unit / coverage matrix

```bash
pnpm test
```

Every workspace with executable source must stay at or above **80%** statements, branches, functions and lines (`config/coverage-thresholds.json`).

## Mock the public API

```bash
pnpm run contracts:mock
```

Serves `contracts/openapi/public.v1.yaml` with Prism so UIs and clients can develop against the contract.

## Local Kubernetes stack (optional)

If you want the reference charts on a laptop:

```bash
node scripts/local-stack.mjs --check
node scripts/local-stack.mjs --up
tilt up
```

Details and smoke URLs: repository file [`docs/release/deployment.md`](https://github.com/blooo-io/intelligent-eu-bps-source/blob/develop/docs/release/deployment.md) (includes a **reference** environment; treat hostnames as examples).

## Next steps

- [Deploy on Kubernetes](./deploy) for a durable environment
- [Configuration](./configuration) for env vars and secrets
- [Adapters](./adapters) to point at your market / IdP / PSP
