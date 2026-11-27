# AC-07 Payments

Stripe Connect **test mode** (BR-12 / AD-6 / INT-107 / INT-189 / INT-190 / INT-191).

## PSP selection

| `PSP_PROVIDER` | Behaviour |
|---|---|
| unset / `mock` | `MockPspAdapter` (unit tests / local) |
| `stripe` | `StripePspAdapter` (dev Helm sets this; needs OpenBao secrets) |

## Onboarding (INT-190 / INT-191)

- Producer/prosumer: EWDS command `startKyc` (AC-10 → internal API) → `OnboardingSession` (`mode: requirements`) **without** creating a Connect account yet.
- KYC: `POST .../onboarding/requirements` with `accountToken` (Stripe.js Account Token) creates a **Custom** Connect account (`controller.requirement_collection=application`, `losses.payments=application`, country default `FR`).
- Server-side `tokens.create` is the fallback when `accountToken` is omitted (tests / internal callers).
- Consumer: the same command returns `mode: link` + SetupIntent fixture URL.
- Destination charges unchanged (`transfer_data.destination`).

Secrets come from OpenBao `dev/payments` via External Secrets (`stripe_secret_key`, `stripe_webhook_secret`, `stripe_connect_webhook_secret`). The publishable key for embedded Stripe.js flows is returned in the PspHandoff of the EWDS command reply (A7-bis). Webhook route: `POST /webhooks/payment-provider` (raw body + Stripe-Signature).
