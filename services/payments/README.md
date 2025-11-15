# `services/payments` (AC-07)

Stripe Connect **test mode** payments (INT-107 / BR-12 / P-PSP).

| Operation | Path | Spec |
|---|---|---|
| Onboarding | `POST /v1/me/payment-account/onboarding` | REQ-040, REQ-051 |
| Pay invoice | `POST /v1/invoices/{id}/payments` | REQ-014 |
| Webhook | `POST /webhooks/payment-provider` | NFR-015 |

Port methods: `createProducerAccount`, `onboardingLink`, `attachPaymentMethod`, `createPayment`, `refund`, `verifyWebhook`. Stripe is master of accounts/payments (TP-7); V1 uses a mock PSP adapter in tests.
