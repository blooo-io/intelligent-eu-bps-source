# `services/invoicing` (AC-06)

Maps pair settlements to Stripe invoices on the producer's Connect account (INT-106 / TD-2).

| Operation | Path | Spec |
|---|---|---|
| GetInvoice | `GET /internal/v1/invoices/{id}` | REQ-039 |
| MarkOverdue | `POST /internal/v1/invoices:mark-overdue` | REQ-044 |
| SetInvoiceStatus | `POST /v1/invoices/{id}/status` | REQ-044, UAT-055 |
| createFromSettlement | domain (SettlementCompleted) | TD-2, BR-09, BR-10 |

Stripe remains master of numbering, PDF and e-mail (BR-10 / TP-7). V1 uses a mock Stripe invoice adapter for tests; live `stripe-node` wiring follows with secrets from OpenBao.
