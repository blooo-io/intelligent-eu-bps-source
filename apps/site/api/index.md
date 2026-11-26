# API reference (withdrawn)

**INT-455** — the public REST OpenAPI `/v1` catalogue and interactive browser are **withdrawn**.

External integration with billing is **EWDS-only**:

- **Published records** — statements, invoices, payments, payouts, KYC status (see [EWDS topic schemas](/architecture/ewds-topics)).
- **Command channel** — pay invoice, start KYC, accept terms, billing runs, and other actions (AsyncAPI under `contracts/asyncapi/` in the repository).

Nest modules still expose **internal** HTTP APIs (`contracts/openapi/internal/`) for service-to-service use; these are not published on the gateway as a product API.

Narrative integration notes: [API & events](/reference/api). Decision record: [INT-455](https://github.com/blooo-io/intelligent-eu-bps-source/blob/develop/docs/architecture/decisions/INT-455-remove-public-v1.md).

E2E evidence for the project path: EWDS project-path tests (`docs/testing/ewds-project-path-e2e.md`); cluster EWDS E2E is tracked under INT-454.