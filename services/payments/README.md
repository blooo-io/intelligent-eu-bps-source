# AC-07 Payments

Stripe Connect **test mode** (BR-12 / AD-6 / INT-107 / INT-189).

## PSP selection

| `PSP_PROVIDER` | Behaviour |
|---|---|
| unset / `mock` | `MockPspAdapter` (unit tests / local) |
| `stripe` | `StripePspAdapter` (dev Helm sets this; needs OpenBao secrets) |

Secrets come from OpenBao `dev/payments` via External Secrets (`stripe_secret_key`, `stripe_webhook_secret`, `stripe_connect_webhook_secret`). Webhook route: `POST /webhooks/payment-provider` (raw body + Stripe-Signature).
