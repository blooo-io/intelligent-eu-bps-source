# Security & secrets

## Principles

- **No secrets in Git.** Use your organisation’s secret manager and inject at runtime.
- **EU data residency.** Prefer EU/adequate hosting for personal data (NFR-002).
- **Minimise personal data** in logs, traces and events — use opaque identifiers.
- **Stripe is master** of Connect accounts, KYC, invoices and payments; store ids and rebuildable caches only (TP-7).

## Recommended secret categories

| Secret | Used by |
|---|---|
| Database credentials | Each module |
| Stripe secret + webhook signing secret | Payments / invoicing |
| OIDC client secret (if confidential client) | Gateway / web |
| SMTP / notification credentials | Notification |
| Registry pull credentials | Nodes / deploy |

The reference stack uses OpenBao + External Secrets Operator. You may use Vault, Sealed Secrets, SOPS, or a cloud KMS — keep the **same env var names** expected by the charts where possible.

## Network

- Terminate TLS at the ingress / gateway.
- Restrict module ClusterIP services; only the gateway should be public.
- Apply NetworkPolicies if your cluster supports them (examples under `deploy/`).

## Supply chain

CI runs secret scanning (gitleaks) and image scanning (Trivy) on the upstream workflows. Reuse or replace those jobs in your own pipeline before you promote images.
