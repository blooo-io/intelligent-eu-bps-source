# Container image pattern (TD-11 / INT-156)

GitHub Actions builds and pushes images to **GHCR** (`scripts/module-images.mjs`). Argo CD syncs Helm releases that reference those tags.

## Rules

- One `Dockerfile` per runnable module under `services/<name>/`, `apps/<name>/`, `packages/<name>/`, or `mocks/`.
- Build context is always the **repository root**.
- The final stage must set a non-root `USER` (not `root` / `0`). Prefer `gcr.io/distroless/nodejs22-debian13:nonroot` (or newer); do not use the frozen `nodejs22-debian12` family.
- Listen on `PORT` (default `8080`) and expose `GET /health` for probes.
- No secrets or personal data in the image layers.
- CI: `trivy fs` (`trivy.yaml`) enforces TP-2 licences on linked dependencies; `trivy image` (`trivy-image.yaml`) enforces vulnerabilities only (OS package licences are not application deps).

## First image: `services/cd-smoke`

Factory smoke service used to prove CI → Trivy → GHCR before product modules exist. Image name:

`ghcr.io/blooo-io/intelligent-eu-billing-and-payment/services-cd-smoke:<sha>`

## Next NestJS modules

1. Scaffold the service from `packages/module-template` (INT-98).
2. Copy `services/cd-smoke/Dockerfile` and point `COPY` paths at the new service (and any workspace packages it needs).
3. Set `image.repository` in `deploy/charts/<name>/values.yaml` to match `imageSuffix` from `scripts/module-images.mjs` (`services-<name>`).
4. Keep `replicaCount: 0` in env values until the first successful push, then raise replicas for smoke on `dev`.
