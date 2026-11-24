# Testing docs

## Demo workbook (testers)

**Primary live-demo document:**

→ [`cahier-de-tests-demo-intelligent-billing-and-payment.md`](./cahier-de-tests-demo-intelligent-billing-and-payment.md)  
→ PDF: [`cahier-de-tests-demo-intelligent-billing-and-payment.pdf`](./cahier-de-tests-demo-intelligent-billing-and-payment.pdf)

Covers Horizon Energy personas, the Invite CSV path (REQ-008 / Mailpit), filled API payloads (INT-398), and refreshed screenshots (INT-399). Regenerate with `node scripts/capture-demo-workbook.mjs` then `node scripts/export-cahier-pdf.mjs`.

| Document | Usage |
|---|---|
| [Demo workbook (personas + screens)](./cahier-de-tests-demo-intelligent-billing-and-payment.md) | Tester / demo support |
| [Manual S1 portal journey](./manual-s1-portal-journey.md) | Money-path S1 complement |
| [V1 UAT package](./v1-uat-package.md) | UAT pack / accounts |
| [v6.1 re-run packaging](./v6.1-rerun.md) | Computed UAT counts + mock-path legend (INT-430) |
| [V1 validation summary](./v1-validation-summary.md) | Status table with Path column |
| [AC-01 e2e](./ac01-e2e.md) | Deployed Playwright |

### Run-path legend (Task 6.14)

| Label | Meaning |
|---|---|
| mock path | `run_path: mock` or `status: Pass on mock path` in the UAT note |
| Stripe test | Stripe test mode |
| live CG / live CGW | Live EWDS Client Gateway; keep mock-path labelling until re-run |
