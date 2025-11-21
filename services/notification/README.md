# `services/notification` (AC-11)

Payment success and failure notices via P-MAIL (INT-110 / REQ-017). Invoice PDF e-mail stays with Stripe (TD-2).

| Surface | Detail |
|---|---|
| Consume | `PaymentStatusChanged` (`succeeded` / `failed`) |
| Port | P-MAIL → Mailpit catcher in V1 (TD-12) |

`NotificationLog` stores identifiers only (no e-mail addresses). Deploy Mailpit is the cluster catcher; unit tests use an in-memory Mailpit catcher adapter.
