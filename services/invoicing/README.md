# `services/invoicing` (AC-06)

Maps pair settlements to billing-owned invoices: sequential legal numbers per producer, PDF and e-mail (INT-428 / A6 / TD-2).

| Operation | Path | Spec |
|---|---|---|
| GetInvoice | `GET /internal/v1/invoices/{id}` | REQ-039 |
| MarkOverdue | `POST /internal/v1/invoices:mark-overdue` | REQ-044 |
| SetInvoiceStatus | `POST /v1/invoices/{id}/status` | REQ-044, UAT-055 |
| createFromSettlement | domain (SettlementCompleted) | TD-2, BR-09, BR-10 |

**Billing is master of invoices (numbering, PDF, e-mail); Stripe is master of accounts, KYC and payments.**

## Reminders (REQ-061)

| Env | Default | Behaviour |
|---|---|---|
| `REMINDER_INTERVAL_DAYS` | `7` | Days between scheduled reminders on Overdue invoices |
| `REMINDER_MAX` | `3` | Maximum scheduled reminders per invoice |

NetworkPolicy: `stripeEgress: false`; egress to `settlement` and `participants`; ingress from `payments`, `scheduler-worker` and `notification`.
