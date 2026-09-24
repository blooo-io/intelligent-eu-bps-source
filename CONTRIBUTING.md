# Contributing

Thank you for contributing to the **INTELLIGENT Billing & Payment Service** (Apache-2.0).

**Deploying or integrating the product?** Start with the public documentation site (`apps/site`, GitHub Pages) — [Guide](apps/site/guide/introduction.md) — not with the upstream delivery process below.

## Open contribution (any GitHub user)

1. Fork the repository and create a topic branch from `develop`.
2. Prefer [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `ci:`, `chore:`).
3. **Contract-first:** change `contracts/openapi` or `contracts/asyncapi` before implementation when APIs or events change; keep lint green.
4. Add or update automated tests. Every module with executable source must stay at or above **80%** statements, branches, functions and lines (`config/coverage-thresholds.json`).
5. Do not commit secrets, kubeconfigs or personal data samples.
6. New dependencies must be **MIT or Apache-2.0** only (technical principle TP-2).
7. Open a pull request against `develop`. Describe the change and link related issues. Squash-merge is preferred.

Local commands: `pnpm install`, `pnpm run contracts:lint`, `pnpm test`. Docs site: `pnpm --filter @intelligent/site dev`.

More detail: public pages under [`apps/site/contribute/`](apps/site/contribute/index.md).

## Definition of Done (shared)

- [ ] Contract (OpenAPI / AsyncAPI) created or updated first when the interface changes; lint green; no unannounced breaking change
- [ ] Code implements the contract (request/response validation on)
- [ ] GitHub Actions CI green; coverage floors met
- [ ] Docs updated when behaviour or deployment steps change (`apps/site` and/or `docs/`)
- [ ] No personal data in logs or events; no secret in the diff
- [ ] New dependencies MIT / Apache-2.0

---

## Upstream maintainer process (optional)

The following applies to the **originating delivery team** that tracks work in Jira project `INT` and operates a reference cluster. **External contributors and adopters are not required to follow it.**

### Work items

- Changes start from an issue in Jira **INTELLIGENT (`INT`)** (Workstream → Task → Sub-task).
- Tasks name modules and spec ids (`REQ-xxx`, `UAT-xxx`); requirement text stays in `docs/`.

### Branches and review

- Default branch: `develop`.
- Branch names: `<type>/INT-123-short-description` (or the Cloud Agent `cursor/…` convention when applicable).
- Commits include the Jira key, e.g. `feat(invoicing): INT-123 issue invoice per consumer-producer pair`.
- Do not add a coding-assistant co-author trailer (stripped by `.githooks/commit-msg`, rejected in CI).
- Pull requests: title includes `INT-123`; use the PR template; request `blooo-io/github-admin` when available; squash-merge into `develop`.

### Reference deployment

- Built versions may be deployed to the upstream sample cluster via GitOps (Argo CD). See `docs/release/deployment.md` and `docs/maintainers/`. Treat hostnames and cloud accounts as **examples**.
- Never commit a kubeconfig. Pass operator credentials only through local `KUBECONFIG`.

### Traceability extras

- Reference `REQ-xxx` / `UAT-xxx` in tests and PRs; update UAT status files under `docs/requirements/items/uat/` when a UAT passes.
- GitHub for Jira may link branches and PRs to `INT-xxx` issues.
