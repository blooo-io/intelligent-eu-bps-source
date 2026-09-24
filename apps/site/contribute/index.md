# How to contribute

Contributions are welcome under the [Apache License 2.0](https://github.com/blooo-io/intelligent-eu-billing-and-payment/blob/develop/LICENSE).

## Before you start

1. Read the [introduction](/guide/introduction) and [architecture](/reference/architecture) overview.
2. Search existing issues and pull requests on GitHub.
3. For API or event changes, edit files under `contracts/` **first**.

## Suggested workflow

```text
fork → branch → contracts (if needed) → code → tests → pull request
```

- Keep commits focused; Conventional Commits are appreciated (`feat:`, `fix:`, `docs:`, …).
- Do not commit secrets, personal data samples, or kubeconfigs.
- New dependencies must be **MIT or Apache-2.0** (TP-2).
- Every module with executable source must stay ≥ **80%** coverage.

## Pull requests

- Describe the user-visible change and link any issue.
- Ensure GitHub Actions CI is green.
- Update docs when behaviour or deployment steps change.

Upstream organisations may use additional internal trackers; that is **not required** to contribute via GitHub. See [Upstream maintainers](./upstream-maintainers).

## Development details

See [Development](./development).
