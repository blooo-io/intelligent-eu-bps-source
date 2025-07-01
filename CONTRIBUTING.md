# Contributing

## Work items: Jira `INT`
- Every change starts from an issue in the Blooo Jira project **INTELLIGENT (`INT`)**. The hierarchy is Workstream → Task → Sub-task.
- A task names the module(s) concerned and the spec ids it covers (`REQ-xxx`, `UAT-xxx`). The requirement text stays in `docs/` and is never copied into Jira.

## Branches and commits
- **Default branch:** `develop`, deployed automatically to the `dev` environment. Release tags `vX.Y.Z` are deployed to `demo`.
- **Branches:** `INT-123-short-description`. They are short-lived and branched from `develop`.
- **Commits** follow Conventional Commits and carry the Jira key, e.g. `feat(invoicing): INT-123 issue invoice per consumer-producer pair`.
- **Pull requests:**
  - title `INT-123 <summary>`;
  - use the PR template;
  - squash-merge into `develop`.

## Definition of Done
- [ ] Contract (OpenAPI / AsyncAPI) created or updated first, lint green, no unannounced breaking change
- [ ] Code implements the contract (request/response validation on)
- [ ] Unit tests + contract tests + the UAT scenario(s) of the task pass (mocks + Stripe test)
- [ ] `REQ-xxx` / `UAT-xxx` referenced in tests and PR; UAT status updated in `docs/requirements/items/uat/`
- [ ] Docs updated if behaviour or architecture changed (spec gap → proposed change described in the PR)
- [ ] No personal data in logs or events; no secret in the diff (gitleaks green)
- [ ] New dependencies are MIT / Apache-2.0
- [ ] Deployed and smoke-tested on `dev`

## GitHub ↔ Jira
The **GitHub for Jira** app links branches, commits, PRs and builds to the `INT-xxx` issue. A merged PR moves the issue forward through a Jira automation rule.
