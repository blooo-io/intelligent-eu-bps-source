# Contributing

## Work items: Jira `INT`
- Every change starts from an issue in the Blooo Jira project **INTELLIGENT (`INT`)**. The hierarchy is Workstream → Task → Sub-task.
- Assign every issue to Steven Lin. Do not assign Maylis Ametowoglo.
- A task names the module(s) concerned and the spec ids it covers (`REQ-xxx`, `UAT-xxx`). The requirement text stays in `docs/` and is never copied into Jira.

## Branches and commits

- **Default branch:** `develop`. Each built version whose tests pass is deployed to the Scaleway cluster `k8s-intelligent-eu-dev`, environment `dev`, using your own kubeconfig for that cluster through `KUBECONFIG`. Release tags `vX.Y.Z` are deployed to `demo`. Never commit a kubeconfig.
- **Branches:** `<type>/INT-123-short-description`, branched from `develop` and short-lived. Create the Jira issue first when the change does not already have one. The type matches the Conventional Commit of the change:

  | Branch prefix | Use | Commit type |
  |---|---|---|
  | `feature/` | New behaviour | `feat` |
  | `fix/` | Bug fix | `fix` |
  | `docs/` | Documentation only | `docs` |
  | `test/` | Tests only | `test` |
  | `refactor/` | Behaviour-preserving restructure | `refactor` |
  | `ci/` | Pipeline, tooling or build | `ci` |
  | `chore/` | Maintenance that fits none of the above | `chore` |

- **Commits** follow Conventional Commits and carry the Jira key, e.g. `feat(invoicing): INT-123 issue invoice per consumer-producer pair`.
- **Pull requests:**
  - title `INT-123 <summary>`;
  - use the PR template;
  - request the `blooo-io/github-admin` team as reviewer;
  - squash-merge into `develop`.

## Definition of Done
- [ ] Contract (OpenAPI / AsyncAPI) created or updated first, lint green, no unannounced breaking change
- [ ] Code implements the contract (request/response validation on)
- [ ] GitHub Actions runs every test script. Each module with executable source is at or above 80% statements, branches, functions and lines (`config/coverage-thresholds.json`)
- [ ] Unit tests + contract tests + the UAT scenario(s) of the task pass (mocks + Stripe test)
- [ ] `REQ-xxx` / `UAT-xxx` referenced in tests and PR; UAT status updated in `docs/requirements/items/uat/`
- [ ] Docs updated if behaviour or architecture changed (spec gap → proposed change described in the PR)
- [ ] No personal data in logs or events; no secret in the diff (gitleaks green)
- [ ] New dependencies are MIT / Apache-2.0
- [ ] Built version deployed and smoke-tested on `k8s-intelligent-eu-dev` (`dev`)

## GitHub ↔ Jira
The **GitHub for Jira** app links branches, commits, PRs and builds to the `INT-xxx` issue. A merged PR moves the issue forward through a Jira automation rule.
