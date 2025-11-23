# Container image pattern (TD-11 / INT-156)

GitHub Actions builds and pushes images to **GHCR** (`scripts/module-images.mjs`). Argo CD syncs Helm releases that reference those tags.

## Rules

- One `Dockerfile` per runnable module under `services/<name>/`, `apps/<name>/`, `packages/<name>/`, or `mocks/`.
- Build context is always the **repository root**.
- The final stage must set a non-root `USER` (not `root` / `0`). Prefer `gcr.io/distroless/nodejs22-debian13:nonroot` (or newer); do not use the frozen `nodejs22-debian12` family.
- Listen on `PORT` (default `8080`) and expose `GET /health` for probes.
- No secrets or personal data in the image layers.
- CI: workflow `supply-chain` (INT-176) runs **after merge to `develop` only** — not on every PR. `trivy fs` (`trivy.yaml`) enforces TP-2 licences; `trivy image` (`trivy-image.yaml`) scans image vulns. Images are tagged with `$GITHUB_SHA` and pushed to GHCR.
- GitOps pin (INT-177): the same workflow’s `pin-image-tag` job writes `deploy/envs/dev/values.yaml` `image.tag` to that SHA (`[skip ci]`). Argo CD syncs charts from `develop` and rolls pods.
- Replicas: charts **with** a Dockerfile default to `replicaCount: 1`; charts without an image stay at `0`.
- Pull: GHCR is private. Secret `ghcr-pull` in `int-apps` comes from OpenBao `platform/ghcr-pull` (`deploy/charts/ghcr-pull`). Seed with `GHCR_PULL_TOKEN=… node scripts/openbao-seed-ghcr-pull.mjs --apply` (token needs `read:packages`).

## First image: `services/cd-smoke`

Factory smoke service used to prove CI → Trivy → GHCR before product modules exist. Image name:

`ghcr.io/blooo-io/intelligent-eu-billing-and-payment/services-cd-smoke:<sha>`

## Next NestJS modules

1. Scaffold the service from `packages/module-template` (INT-98).
2. Copy `services/cd-smoke/Dockerfile` and point `COPY` paths at the new service (and any workspace packages it needs).
3. Set `image.repository` in `deploy/charts/<name>/values.yaml` to match `imageSuffix` from `scripts/module-images.mjs` (`services-<name>`).
4. Keep `replicaCount: 0` in env values until the first successful push, then raise replicas for smoke on `dev`.
