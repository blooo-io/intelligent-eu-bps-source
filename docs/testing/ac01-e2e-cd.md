# AC-01 E2E continuous verification (INT-184)

Industrial pattern: **GitOps deploys; a separate verification pipeline validates the live URL**.

```text
supply-chain (images) → rollout web (:develop) → Playwright → app.dev
```

Not run on pull requests. Not a cloistered localhost SPA.

## Workflow

`.github/workflows/e2e-dev.yml` (`e2e-dev`):

| Trigger | When |
|---|---|
| `workflow_run` | After **successful** `supply-chain` on `develop` |
| `workflow_dispatch` | Operator manual run (Actions → e2e-dev → Run) |
| `repository_dispatch` type `e2e-dev` | Future Argo CD Notifications / external hook |

Environment: GitHub **`dev`** (secret `KUBECONFIG_INTELLIGENT_EU_DEV`).

Steps: checkout `develop` → restart floating `:develop` Deployments in `int-apps` (web + AC modules, INT-178 / INT-229 / INT-280) → wait HTTP 200 on `https://app.dev.intelligent-eu-bp.blooo.dev/` → Playwright suite (`docs/testing/ac01-e2e.md`).

## Why restart Deployments

Charts pin `image.tag: develop` + `pullPolicy: Always`. Argo does not redeploy when only the registry digest for that tag changes. Restarting each Deployment is the documented INT-178 operator path packaged into this verification job. INT-280 extends the roll list beyond web/settlement so selectively rebuilt modules (e.g. `reference-data`) are not left on a stale digest.

## Optional next (Argo Notifications)

Wire `argocd-notifications` so `on-deployed` for `dev-web` sends `repository_dispatch` (`e2e-dev`) when Synced+Healthy. Requires a PAT in `argocd-notifications-secret` (never commit). Until then, `workflow_run` after supply-chain is the automation path.
