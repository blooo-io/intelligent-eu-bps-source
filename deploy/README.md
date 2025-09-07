# deploy/

Kubernetes packaging, delivered by GitOps with Argo CD. See `docs/architecture/04-technical-architecture.md` and `05-physical-architecture.md`.

- `charts/`: one Helm chart per module and for the web app. `charts/module` holds the shared templates. Platform event charts: `nats` (shared), `debezium-server` (per env data namespace) — TD-7 / INT-132. `charts/cd-smoke` is the factory CD smoke workload (INT-156 / TD-11).
- `docker/`: Dockerfile pattern notes for NestJS modules (INT-156).
- `platform/`: notes for shared event transport packaging.
- `helmfile/`: one release per module chart, plus `debezium-server` into `dataNamespace` and `cd-smoke` into `appsNamespace`. Shared NATS is installed once via Argo (`argocd/platform/nats.yaml`).
- `argocd/dev/`, `argocd/demo/`, `argocd/platform/`: Argo CD applications.
- `envs/dev/`, `envs/demo/`: values per environment.
  - `dev` follows `develop` and renders into the physical namespaces `int-apps` and `int-data`.
  - `demo` follows a release tag and renders into `demo-apps` and `demo-data`. Demo sync is manual.
  - Both run in virtual mode with Stripe test.
  - Module replicas stay at 0 until that module's image exists. Raise `cd-smoke` replicas on `dev` after the first GHCR push to smoke the GitOps loop. Debezium stays at 0 until CNPG + OpenBao credentials exist.

**Target:** Scaleway Kapsule, region nl-ams, under the hosts `*.intelligent-eu-bp.blooo.dev`.

**Secrets:** only `ExternalSecret` resources pointing to OpenBao. No secret values in Git.

**Argo bootstrap (INT-155):** see `deploy/argocd/README.md` or `node scripts/argocd-bootstrap.mjs --print`. Never commit a kubeconfig. Environment `dev` secret `KUBECONFIG_INTELLIGENT_EU_DEV` powers the `argocd-bootstrap` workflow.

**CD loop (TD-11 / physical §7):** GitHub Actions builds, tests and pushes images to GHCR. Argo CD pulls manifests from Git (`dev` → `develop`).
