# Argo CD applications (INT-155 / TD-11)

Application manifests for `dev` (track `develop`), `demo` (manual sync), and shared `platform/` (NATS, ESO, cert-manager, OpenBao — INT-132 / INT-133).

## Operator prerequisite

Your machine must already talk to Scaleway Kapsule as:

```text
admin@k8s-intelligent-eu-dev
```

Default kubeconfig path is fine:

```bash
kubectl config current-context
# → admin@k8s-intelligent-eu-dev
```

Never commit a kubeconfig. For CI bootstrap, store in the GitHub Actions **environment `dev`**:

| Secret | Required | Role |
|---|---|---|
| `KUBECONFIG_INTELLIGENT_EU_DEV` | yes | cluster access for bootstrap only |
| `ARGOCD_GITHUB_TOKEN` | yes for private repo | read-only PAT (`contents:read`) → Argo repository Secret `repo-intelligent-eu-bps-source` (INT-319; replaces pre-rename `repo-intelligent-eu-billing-and-payment`) |

Routine CD after Argo is up is Argo pulling Git — do not keep using the kubeconfig secret for every deploy.

```bash
node scripts/argocd-repo-credentials.mjs --check   # CI
node scripts/argocd-repo-credentials.mjs --print   # operator steps
ARGOCD_GITHUB_TOKEN=… KUBECONFIG=… node scripts/argocd-repo-credentials.mjs --apply
```

## Bootstrap via GitHub Actions (preferred when the secret is set)

1. Open **Actions → argocd-bootstrap → Run workflow**.
2. Select branch `develop`.
3. Run. The job uses environment `dev` + secret `KUBECONFIG_INTELLIGENT_EU_DEV`, installs Argo CD chart `8.5.8`, then `kubectl apply -f deploy/argocd/dev/` and `deploy/argocd/platform/`.

Workflow file: `.github/workflows/argocd-bootstrap.yml` (workflow_dispatch only).

## Bootstrap on the operator laptop (alternative)

From the repository root, with Helm 3 and kubectl installed:

```bash
# 1. Confirm context
kubectl config current-context
# must print: admin@k8s-intelligent-eu-dev

# 2. Install / upgrade Argo CD (official chart, Apache-2.0)
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update
helm upgrade --install argocd argo/argo-cd \
  --namespace argocd \
  --create-namespace \
  --version 8.5.8 \
  -f deploy/argocd/bootstrap/values.yaml \
  --wait

# 3. Register Application manifests that exist on this branch / develop
kubectl apply -f deploy/argocd/dev/
kubectl apply -f deploy/argocd/platform/

# 4. Open the UI (temporary; public host comes with APISIX later)
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d; echo
kubectl -n argocd port-forward svc/argocd-server 8080:443
# browser: https://localhost:8080  (user: admin)
```

Or print the same commands from CI-safe packaging:

```bash
node scripts/argocd-bootstrap.mjs --check   # layout only (CI)
node scripts/argocd-bootstrap.mjs --print   # copy-paste operator steps
```

## After Argo is up

- GitHub Actions builds and pushes images to GHCR.
- Merges to `develop` update Helm charts in Git.
- Argo syncs Applications — no kubeconfig needed in CI for day-to-day deploys.
- Module `replicaCount` stays `0` until that module's image exists (`deploy/envs/dev/values.yaml`).
- Platform secrets (INT-133): after `platform-external-secrets` / `platform-openbao` sync, follow `deploy/platform/README.md` for OpenBao init and the live `openbao-eso-token` Secret (never in Git). Module apps need the ESO CRDs before they can sync `ExternalSecret` resources.

## Fallback until Argo is installed

```bash
helmfile -e dev -f deploy/helmfile/helmfile.yaml apply
```

Same `KUBECONFIG` / current-context as above. Do not deploy development builds to `demo`.
