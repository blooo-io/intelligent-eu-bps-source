# `services/invoicing` (AC-06)

Maps pair settlements to **billing-owned** invoices (A6 / INT-428 / TD-2): sequential legal numbers per producer, PDF stored in the invoicing DB, lifecycle and reminders. E-mail on issue and payment reminders go through AC-11.

| Operation | Path | Spec |
|---|---|---|
| GetInvoice | `GET /internal/v1/invoices/{id}` | REQ-039 |
| GetInvoiceDocument | `GET /internal/v1/invoices/{id}/document` | REQ-039, UAT-050 |
| MarkOverdue | `POST /internal/v1/invoices:mark-overdue` | REQ-044 |
| SendReminders | `POST /internal/v1/invoices:send-reminders` | REQ-061, UAT-078 |
| SetInvoiceStatus | `POST /v1/invoices/{id}/status` | REQ-044, UAT-055 |
| SendReminder (manual) | `POST /v1/invoices/{id}/reminders` | REQ-061, UAT-078 |
| createFromSettlement | domain (SettlementCompleted) | TD-2, BR-09, BR-10, UAT-053 |

**Billing is master of invoices (numbering, PDF, e-mail); Stripe is master of accounts, KYC and payments.** Stripe Invoicing is removed (A6).

## Legal numbers (REQ-042 / UAT-053)

Format `SB-<first 8 hex of producerId, upper case>-<6-digit sequence>`. One gapless series per producer, assigned inside the issue transaction, immutable afterwards. Never published on EWDS (only `invoiceId`).

## Reminders (REQ-061 / UAT-078)

| Env | Default | Behaviour |
|---|---|---|
| `REMINDER_INTERVAL_DAYS` | `7` | Days between scheduled reminders on Overdue invoices |
| `REMINDER_MAX` | `3` | Maximum scheduled reminders per invoice |

Manual: community manager `POST /v1/invoices/{id}/reminders` → outbox `PaymentReminderRequested` (`trigger: manual`). Scheduled: job `SendReminders` / `POST /internal/v1/invoices:send-reminders` with `{communityId, asOf}`.

NetworkPolicy: `stripeEgress: false`; egress to `settlement` and `participants`; ingress from `payments`, `scheduler-worker` and `notification`.
