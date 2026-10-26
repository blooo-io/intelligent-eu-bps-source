# Container image pattern (TD-11 / INT-156)

GitHub Actions builds and pushes images to **GHCR** (`scripts/module-images.mjs`). Argo CD syncs Helm releases that reference those tags.

## Rules

- One `Dockerfile` per runnable module under `services/<name>/`, `apps/<name>/`, `packages/<name>/`, or `mocks/`.
- Build context is always the **repository root**.
- The final stage must set a non-root `USER` (not `root` / `0`). Prefer `gcr.io/distroless/nodejs22-debian13:nonroot` (or newer); do not use the frozen `nodejs22-debian12` family.
- Listen on `PORT` (default `8080`) and expose `GET /health` for probes.
- No secrets or personal data in the image layers.
- CI: workflow `supply-chain` (INT-176) runs **after merge to `develop` only** — not on every PR. `trivy fs` / `trivy image` scan; images push as `:$GITHUB_SHA` (provenance) and `:develop` (INT-178 floating tag for Argo).
- Selective builds (INT-183 / INT-185 / INT-319): `scripts/module-images.mjs` with `IMAGE_CHANGED_ONLY=true` rebuilds only images whose trees changed between `IMAGE_DIFF_BASE` (`github.event.before`) and `IMAGE_DIFF_HEAD` (`github.sha`). Examples: `apps/web/**` → `apps-web` only; `services/<name>/**` → that service only; `packages/**` / `config/**` / root `package.json` → all images; `pnpm-lock.yaml` + only `apps/web` (e.g. Playwright devDependency) → `apps-web` only; lockfile + `services/*/package.json` → all; `docs/**` + `deploy/**` + `contracts/**` + `scripts/**` → skip image build. Unreachable base → first-parent fallback (INT-318) then selective. Override registry path with `IMAGE_GHCR_REPOSITORY` (default `GITHUB_REPOSITORY`).
- Rollout (INT-177/178): `deploy/envs/dev/values.yaml` uses `image.tag: develop` + `pullPolicy: Always`. Branch protection forbids bot commits on `develop`, so we do not pin the SHA in Git. After a floating-tag push, restart the Deployment (`kubectl -n int-apps rollout restart deploy/<name>`) so nodes pull the new digest.
- Replicas: charts **with** a Dockerfile default to `replicaCount: 1`; charts without an image stay at `0`.
- Pull: GHCR is private. Secret `ghcr-pull` in `int-apps` comes from OpenBao `platform/ghcr-pull` (`deploy/charts/ghcr-pull`). Seed with `GHCR_PULL_TOKEN=… node scripts/openbao-seed-ghcr-pull.mjs --apply` (token needs `read:packages`).


## First image: `services/cd-smoke`

Factory smoke service used to prove CI → Trivy → GHCR before product modules exist. Image name:

`ghcr.io/blooo-io/intelligent-eu-bps-source/services-cd-smoke:<sha>`

## Next NestJS modules

1. Scaffold the service from `packages/module-template` (INT-98).
2. Copy `services/cd-smoke/Dockerfile` and point `COPY` paths at the new service (and any workspace packages it needs).
3. Set `image.repository` in `deploy/charts/<name>/values.yaml` to match `imageSuffix` from `scripts/module-images.mjs` (`services-<name>`).
4. Keep `replicaCount: 0` in env values until the first successful push, then raise replicas for smoke on `dev`.
