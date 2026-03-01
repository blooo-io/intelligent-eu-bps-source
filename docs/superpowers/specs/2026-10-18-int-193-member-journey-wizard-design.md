# INT-193 — Member journey wizard (onboarding → KYC → payment)

**Status:** approved by operator direction 2026-10-18  
**Jira:** INT-193 (parent INT-16)  
**Covers:** NFR-016 / UAT-067 (step-count target deferred); unblocks journey for UAT-015 / 028 / 050 / 053 where Stripe test allows

## Goal

A representative member completes **profile → terms → payment setup (KYC or PM) → pay invoice** without assistance, guided by a single Ant Design **Steps** wizard on AC-01. Optimising the number of steps is out of scope for this ticket.

## Decisions

| Topic | Choice |
|---|---|
| UX | One `/onboarding` wizard with Steps; keep existing `/profile`, `/terms`, `/payment-setup`, `/invoices` as deep-linkable steps |
| Step count | Not gated — UAT-067 Pass when the journey completes without assistance |
| Producer KYC | Existing Account Token form (INT-191) embedded as the payment step |
| Consumer PM | SetupIntent + Payment Element (`mode: elements` + `clientSecret`); confirm via `POST …/payment-method` |
| Invoice pay | Real amount + producer Connect account from AC-06 (drop pay fixtures) |
| Readiness | Public/internal path so KYC/PM completion sets `paymentAccountReady` (Ready) |
| Stripe | Test mode only (BR-12) |

## Public API changes (contract first)

1. Extend `OnboardingSession.mode` with `elements`; add optional `clientSecret`.
2. Add `POST /v1/me/payment-account/payment-method` `{ paymentMethodId }` → attach + emit status.
3. Implement AC-06 `GET /v1/me/invoices`, `GET /v1/invoices/{id}`, `GET /v1/invoices/{id}/document` (already contracted).
4. AC-07 `payInvoice` loads invoice from AC-06 internal GET (amount, consumer, producer Connect id).

## Module impact

- **contracts** — `public.v1.yaml` OnboardingSession + payment-method endpoint.
- **AC-07** — SetupIntent create; confirm PM; invoice client for pay; optional internal notify of Connect account for invoicing.
- **AC-06** — public list/get/document; store PDF URL / Stripe hosted invoice URL.
- **AC-03** — internal `POST …/payment-account-status` (or existing apply path) called from payments after emit (V1 sync HTTP until NATS consumer lands).
- **AC-01** — wizard page, checklist links, Elements for consumer, auto-advance between steps.

## Out of scope

- Hard step-count SLA for NFR-016 (pilot validation later).
- Live Stripe keys; Express dashboard redesign.
- Full Debezium/NATS consumer wiring (use internal HTTP bridge for V1).
