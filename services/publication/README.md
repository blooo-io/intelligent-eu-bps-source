# `services/publication` (AC-10)

Publishes `billingInvoice` / `billingPayment` to the data space via P-DS (INT-109 / REQ-048). V1 uses the AC-15 mock gateway (NFR-017 deferred).

| Operation | Path | Spec |
|---|---|---|
| RetryPending | `POST /internal/v1/publication:retry-pending` | REQ-048 |
| PurgeCache | `POST /internal/v1/publication:purge-cache` | REQ-053 |

Consumes `InvoiceIssued`, `InvoiceStatusChanged`, `PaymentStatusChanged`. BR-11: never mutates trade status.
