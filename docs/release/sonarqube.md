# SonarQube quality pipeline (INT-291)

Measures maintainability, reliability, security hotspots and test coverage for the billing monorepo. Complements the existing 80% Vitest gate (`config/coverage-thresholds.json`) with a Sonar quality gate.

## What runs

1. **CI job `sonarqube`** in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) on every pull request and on `develop` — downloads the Vitest coverage artifact from the `test` job (no second full test run), then runs the official scanner.
2. **Manual re-scan** via [`.github/workflows/sonarqube.yml`](../../.github/workflows/sonarqube.yml) (`workflow_dispatch`) when operators want an on-demand analysis.

Both wait on the Sonar **quality gate** (`sonar.qualitygate.wait=true`) when `SONAR_TOKEN` is set — a failed gate fails the job.

Project descriptor: [`sonar-project.properties`](../../sonar-project.properties).

## Backend options

| Backend | `SONAR_HOST_URL` | Notes |
|---|---|---|
| **SonarCloud** (default) | `https://sonarcloud.io` | Create project `blooo-io_intelligent-eu-billing-and-payment` under organisation `blooo-io` |
| Self-hosted SonarQube | `https://sonar.<your-host>` | Community/Developer edition as a **separate unmodified service** (same packaging rule as OpenBao / TP-2) |

## Secrets and variables (GitHub)

| Name | Type | Required | Purpose |
|---|---|---|---|
| `SONAR_TOKEN` | Actions secret | **yes** to enable the job | SonarCloud user/project token or SonarQube user token |
| `SONAR_HOST_URL` | Actions variable (or secret) | no | Defaults to `https://sonarcloud.io` |
| `SONAR_ORGANIZATION` | Actions variable | no | Defaults to `blooo-io` (SonarCloud only) |

Until `SONAR_TOKEN` is set, the workflow **skips the scan** with an explicit notice (CI stays green). After the token is configured, the quality gate is enforced.

### SonarCloud setup (operators)

1. Sign in to [SonarCloud](https://sonarcloud.io) with the `blooo-io` GitHub org.
2. Import `intelligent-eu-billing-and-payment` (or create a project with key `blooo-io_intelligent-eu-billing-and-payment`).
3. Create a project analysis token.
4. Add repository secret `SONAR_TOKEN`.
5. Optionally set variable `SONAR_ORGANIZATION=blooo-io`.
6. Re-run the `sonarqube` workflow on `develop` and open the project dashboard for ratings (A–E) and the quality gate.

## Local dry-run

```bash
# After tests have written coverage/*/lcov.info:
node scripts/sonar-lcov-paths.mjs
# With a local SonarQube or SonarCloud token:
export SONAR_TOKEN=...
export SONAR_HOST_URL=https://sonarcloud.io   # or your server
npx --yes @sonar/scan \
  -Dsonar.javascript.lcov.reportPaths="$(node scripts/sonar-lcov-paths.mjs)"
```

Do not commit tokens. Do not point production analysis at the `dev` IdP secrets.
