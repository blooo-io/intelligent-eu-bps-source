# SonarQube quality pipeline (INT-291 / INT-292 / INT-293)

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
| Bootstrap | [`scripts/sonarqube-bootstrap.mjs`](../../scripts/sonarqube-bootstrap.mjs) (INT-293) |

Operator packaging notes: [`deploy/platform/README.md`](../../deploy/platform/README.md) (Quality section).

## Secrets and variables (GitHub)

| Name | Type | Required | Purpose |
|---|---|---|---|
| `SONAR_TOKEN` | Actions secret | **yes** to enable the job | Project analysis token from OpenBao `platform/sonarqube` field `analysis_token` |
| `SONAR_HOST_URL` | Actions variable | **yes** for cluster Sonar | `https://sonar.intelligent-eu-bp.blooo.dev` |
| `SONAR_ORGANIZATION` | Actions variable | SonarCloud only | Unused by self-hosted Community Build |

Until `SONAR_TOKEN` is set, the workflow **skips the scan** with an explicit notice (CI stays green).

**Community Build note:** self-hosted Community does **not** support pull-request or multi-branch decoration (`sonar.pullrequest.*` / `sonar.branch.name` require Developer Edition+). CI therefore analyses the checked-out tree as the project main branch against `https://sonar.intelligent-eu-bp.blooo.dev`. SonarCloud hosts still get PR decoration when `SONAR_HOST_URL` points at `sonarcloud.io`.

### Cluster bootstrap (operators) — INT-293

After Argo sync + DNS/TLS:

```bash
KUBECONFIG=… node scripts/openbao-seed-dev-placeholders.mjs --apply   # if needed
KUBECONFIG=… node scripts/sonarqube-bootstrap.mjs --apply
```

The bootstrap script (idempotent):

1. Generates / stores `admin_password` in OpenBao (replaces default `admin`/`admin`)
2. Ensures project key `blooo-io_intelligent-eu-billing-and-payment`
3. Ensures analysis token named `ci-intelligent-eu` and stores `analysis_token` in OpenBao
4. Prints `gh` commands to set GitHub `SONAR_HOST_URL` + `SONAR_TOKEN`

Cloud-agent GitHub tokens typically **cannot** write repository secrets (HTTP 403). An operator with repo admin runs the printed `gh secret set` / `gh variable set` once. Do not put tokens in Git.

## Local dry-run

Requires Docker (same image as CI).

```bash
node scripts/sonar-lcov-paths.mjs
export SONAR_HOST_URL=https://sonar.intelligent-eu-bp.blooo.dev
export SONAR_TOKEN="$(… from OpenBao analysis_token …)"
node scripts/sonar-scan.mjs
```

Do not commit tokens. Do not point production analysis at the `dev` IdP secrets.
