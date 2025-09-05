# deploy/

Kubernetes packaging, delivered by GitOps with Argo CD. See `docs/architecture/04-technical-architecture.md` and `05-physical-architecture.md`.

- `charts/`: one Helm chart per module and for the web app. `charts/module` holds the shared templates. Platform event charts: `nats` (shared), `debezium-server` (per env data namespace) — TD-7 / INT-132.
- `platform/`: notes for shared event transport packaging.
- `helmfile/`: one release per module chart, plus `debezium-server` into `dataNamespace`. Shared NATS is installed once via Argo (`argocd/platform/nats.yaml`).
- `argocd/dev/`, `argocd/demo/`, `argocd/platform/`: Argo CD applications.
- `envs/dev/`, `envs/demo/`: values per environment.
  - `dev` follows `develop` and renders into the physical namespaces `int-apps` and `int-data`.
  - `demo` follows a release tag and renders into `demo-apps` and `demo-data`. Demo sync is manual.
  - Both run in virtual mode with Stripe test.
  - Module replicas stay at 0 until that module's image exists. Debezium stays at 0 until CNPG + OpenBao credentials exist.

**Target:** Scaleway Kapsule, region nl-ams, under the hosts `*.intelligent-eu-bp.blooo.dev`.

**Secrets:** only `ExternalSecret` resources pointing to OpenBao. No secret values in Git.
