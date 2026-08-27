# SonarQube quality pipeline (INT-291 / INT-292)

Measures maintainability, reliability, security hotspots and test coverage for the billing monorepo. Complements the existing 80% Vitest gate (`config/coverage-thresholds.json`) with a Sonar quality gate.

## What runs

1. **CI job `sonarqube`** in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) on every pull request and on `develop` — downloads the Vitest coverage artifact from the `test` job (no second full test run), then runs the **official SonarScanner CLI** in Docker via [`scripts/sonar-scan.mjs`](../../scripts/sonar-scan.mjs).
2. **Manual re-scan** via [`.github/workflows/sonarqube.yml`](../../.github/workflows/sonarqube.yml) (`workflow_dispatch`) when operators want an on-demand analysis.

Both wait on the Sonar **quality gate** (`sonar.qualitygate.wait=true`) when `SONAR_TOKEN` is set — a failed gate fails the job.

Project descriptor: [`sonar-project.properties`](../../sonar-project.properties).

Scanner image: `sonarsource/sonar-scanner-cli:11.3` (override with `SONAR_SCANNER_IMAGE`).

## Backend: SonarQube Community Build on the cluster (INT-292)

Preferred for this project: **self-hosted SonarQube Community Build** on `k8s-intelligent-eu-dev`, packaged via GitOps (TP-2 exception — separate unmodified service).

| Piece | Location |
|---|---|
| CNPG database | `deploy/charts/cnpg-sonarqube` → Argo `platform-cnpg-sonarqube` |
| Official Helm chart | `sonarqube` **2026.5.1002**, `community.enabled=true` → Argo `platform-sonarqube` |
| Values | `deploy/platform/sonarqube/values.yaml` |
| Public URL | `https://sonar.intelligent-eu-bp.blooo.dev` (APISIX) |

Operator packaging notes: [`deploy/platform/README.md`](../../deploy/platform/README.md) (Quality section).

SonarCloud remains a possible alternative if the cluster backend is unavailable.

## Secrets and variables (GitHub)

| Name | Type | Required | Purpose |
|---|---|---|---|
| `SONAR_TOKEN` | Actions secret | **yes** to enable the job | SonarQube project analysis token (or SonarCloud token) |
| `SONAR_HOST_URL` | Actions variable | **yes** for cluster Sonar | `https://sonar.intelligent-eu-bp.blooo.dev` (defaults to SonarCloud if unset) |
| `SONAR_ORGANIZATION` | Actions variable | SonarCloud only | Defaults to `blooo-io`; unused by self-hosted Community Build |

Until `SONAR_TOKEN` is set, the workflow **skips the scan** with an explicit notice (CI stays green). After the token is configured, the quality gate is enforced.

### Cluster Sonar setup (operators)

1. Sync Argo apps (`platform-cnpg-sonarqube`, `platform-sonarqube-monitoring-secret`, `platform-sonarqube`) from `develop`.
2. Seed OpenBao placeholder `platform/sonarqube` (`monitoring_passcode`) via `openbao-seed-dev-placeholders.mjs --apply` if missing.
3. Point DNS `sonar.intelligent-eu-bp.blooo.dev` at the APISIX LoadBalancer; wait for Certificate Ready.
4. Open the UI, change the default admin password from the first-boot log.
5. Create project key `blooo-io_intelligent-eu-billing-and-payment` and an analysis token.
6. Add repository secret `SONAR_TOKEN` and variable `SONAR_HOST_URL=https://sonar.intelligent-eu-bp.blooo.dev`.
7. Re-run the `sonarqube` workflow (or push to `develop`) and open the project dashboard.

## Local dry-run

Requires Docker (same image as CI).

```bash
# After tests have written coverage/*/lcov.info:
node scripts/sonar-lcov-paths.mjs
export SONAR_TOKEN=...
export SONAR_HOST_URL=https://sonar.intelligent-eu-bp.blooo.dev
node scripts/sonar-scan.mjs
```

Do not commit tokens. Do not point production analysis at the `dev` IdP secrets.
