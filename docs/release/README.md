# D5.5 release documentation

Operator-facing notes for the V1 Billing & Payment Service release package. Architecture detail stays in [`docs/architecture/`](../architecture/); contracts stay in [`contracts/`](../../contracts/).

## Package index (INT-87)

| Horizon chapter | Start here |
|---|---|
| Narrative + chapter map | [`D5.5-report.md`](D5.5-report.md) |
| Gap analysis (INT-83) | [`D5.5-gap-analysis.md`](D5.5-gap-analysis.md) |
| Requirements | [`../requirements/`](../requirements/) |
| Architecture views | [`../architecture/`](../architecture/) |
| Testing / evidence | [`../testing/`](../testing/) |
| Contracts | [`../../contracts/`](../../contracts/) |

## Operator notes

| Note | Jira | Purpose |
|---|---|---|
| [VERSIONING.md](VERSIONING.md) | INT-305 | SemVer tags, `cut-release`, GitHub Releases, versioned images |
| [SOURCE-RELEASE.md](SOURCE-RELEASE.md) | INT-92 / INT-359 | Freeze name `v1.0.0` (never pushed); published tag `v1.0.1` |
| [deployment.md](deployment.md) | INT-93 | Deploy and configure on Scaleway / local |
| [integration-api.md](integration-api.md) | INT-94 | Integrate via OpenAPI / AsyncAPI |
| [RELEASE-NOTES.md](RELEASE-NOTES.md) | INT-95 | What ships, limitations, licence |
| [PACKAGE-CONSISTENCY.md](PACKAGE-CONSISTENCY.md) | INT-96 | Internal consistency review / approval |
| [FREEZE.md](FREEZE.md) | INT-97 | Source freeze for partner review |
| [D5.5-report.md](D5.5-report.md) | INT-83…91 | Repo-side D5.5 narrative + chapter pointers; index frozen INT-91 |
| [D5.5-gap-analysis.md](D5.5-gap-analysis.md) | INT-83 | Gaps of the pre-restructure narrative vs `develop` |
| [sonarqube.md](sonarqube.md) | INT-291 | SonarQube / SonarCloud quality gate in CI |
