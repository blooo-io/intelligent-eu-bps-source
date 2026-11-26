# Security & secrets

## Principles

- **No secrets in Git.** Use your organisation’s secret manager and inject at runtime.
- **EU data residency.** Prefer EU/adequate hosting for personal data (NFR-002).
- **Minimise personal data** in logs, traces and events — use opaque identifiers.
- **Single master per data item (TP-7).** Billing masters monthly statements, invoices (number, PDF, status), payment and payout records. Stripe masters connected accounts, KYC evidence and the **execution** of charges and payouts; billing stores Stripe ids and a webhook-fed status cache — not invoice PDFs.
- **Stripe data residency.** For EEA Connect accounts the contracting entity is **Stripe Payments Europe, Ltd.** (Ireland). Stripe's DPA applies; transfers to Stripe, Inc. (US) rely on the EU–US Data Privacy Framework and standard contractual clauses. Residual risk from US group access is mitigated by sending **no invoice or statement content** to Stripe — only payment-instrument and KYC data required for charges, onboarding and payouts. DPO sign-off on processor roles remains pending (see physical architecture §4.1).

## Recommended secret categories

| Secret | Used by |
|---|---|
| Database credentials | Each module |
| Stripe secret + webhook signing secret | Payments / invoicing |
| OIDC client secret (if confidential client) | Gateway / service clients |
| SMTP / notification credentials | Notification |
| Registry pull credentials | Nodes / deploy |

The reference stack uses OpenBao + External Secrets Operator. You may use Vault, Sealed Secrets, SOPS, or a cloud KMS — keep the **same env var names** expected by the charts where possible.

## Network

- Terminate TLS at the ingress / gateway.
- Restrict module ClusterIP services; only the gateway should be public.
- Apply NetworkPolicies if your cluster supports them (examples under `deploy/`).

## Supply chain

CI runs secret scanning (gitleaks) and image scanning (Trivy) on the upstream workflows. Reuse or replace those jobs in your own pipeline before you promote images.
