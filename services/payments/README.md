# AC-07 Payments

Stripe Connect **test mode** (BR-12 / AD-6 / INT-107 / INT-189 / INT-190).

## PSP selection

| `PSP_PROVIDER` | Behaviour |
|---|---|
| unset / `mock` | `MockPspAdapter` (unit tests / local) |
| `stripe` | `StripePspAdapter` (dev Helm sets this; needs OpenBao secrets) |

## Onboarding (INT-190)

- Producer/prosumer: `POST /v1/me/payment-account/onboarding` → `OnboardingSession` (`mode: requirements`); KYC via `POST .../onboarding/requirements` (Accounts API, no Account Links).
- Consumer: same start endpoint returns `mode: link` + SetupIntent fixture URL.
- Destination charges unchanged (`transfer_data.destination`); `losses.payments=application`.

Secrets come from OpenBao `dev/payments` via External Secrets (`stripe_secret_key`, `stripe_webhook_secret`, `stripe_connect_webhook_secret`). Webhook route: `POST /webhooks/payment-provider` (raw body + Stripe-Signature).
