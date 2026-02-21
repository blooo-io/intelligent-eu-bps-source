# INT-190 — API-driven Stripe Connect onboarding (approach A)

**Status:** approved 2026-10-18  
**Jira:** INT-190  
**Depends on:** Connect platform profile (Dashboard) — validated; `accounts.create` probe OK

## Goal

Producer/prosumer KYC completes **inside** the portal (UAT-051) using the Stripe Accounts API. No Account Link redirect.

## Decisions

| Topic | Choice |
|---|---|
| Approach | A — first-party forms + Accounts API |
| Charge pattern | Unchanged: destination charges, `losses.payments=application` |
| Consumer path | Unchanged V1: `mode: link` + SetupIntent fixture URL |
| PII | Forwarded to Stripe only; never logged; not stored in our DB beyond Stripe account id |
| Dashboard | Platform-built (wizard); Express dashboard remains as Stripe fallback |

## Public API

### `POST /v1/me/payment-account/onboarding`

Returns `OnboardingSession`:

- Producer/prosumer: creates Connect account if needed; `mode: requirements`; `currentlyDue[]`; `status`.
- Consumer: `mode: link` + `url` (existing fixture).

### `POST /v1/me/payment-account/onboarding/requirements`

Body: structured KYC fields (business type, profile, representative, external account, tos).  
Server maps to `accounts.update`, sets `tos_acceptance` date/ip from the request, returns refreshed `OnboardingSession`.

## Module impact

- **contracts:** replace `OnboardingLink` response with `OnboardingSession`; add requirements endpoint.
- **AC-07:** extend `PspPort` (`getAccountSession`, `submitAccountRequirements`); drop producer `onboardingLink` usage.
- **AC-01:** Payment setup page — requirements form when `mode=requirements`; keep redirect only for `mode=link`.

## Out of scope

- Embedded Connect components
- Live Stripe keys (BR-12)
- Changing destination-charge / invoice adapters
