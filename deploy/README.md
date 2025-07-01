# deploy/

Kubernetes packaging, delivered by GitOps with Argo CD. See `docs/architecture/04-technical-architecture.md` and `05-physical-architecture.md`.

- `charts/`: one Helm chart per module and for the web app.
- `helmfile/`: the helmfile that composes the platform and the application releases.
- `envs/dev/`, `envs/demo/`: values per environment.
  - `dev` follows `develop`.
  - `demo` follows release tags.
  - Both run in virtual mode with Stripe test.

**Target:** Scaleway Kapsule, region nl-ams, under the hosts `*.intelligent-eu-bp.blooo.dev`.

**Secrets:** only `ExternalSecret` resources pointing to OpenBao. No secret values in Git.
