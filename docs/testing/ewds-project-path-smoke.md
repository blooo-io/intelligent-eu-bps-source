---
title: EWDS project-path smoke (INT-453)
date: 2026-11-26
---
# EWDS project-path smoke

## What “smoke” means here

Not the Volt / Playwright `e2e-dev` against `apps/web`.

It means: **prove the project UI path** (records + command channel) works end-to-end **without** calling BPS `/v1` as R2M would:

1. **Actor intake** — EWDS `actor` → `ActorSourcePort` → `ParticipantRecord` with `source=ewds`
2. **Profile lock** — `PUT /v1/me/profile` → `409 profile_managed_by_ewds` (reference client only; R2M must republish `actor`)
3. **acceptTerms** — `billingCommandRequest` → AC-10 → AC-03 `POST .../terms-acceptance` → terms stored
4. **UserAccount publish** — `UserAccountStatusChanged` → AC-10 → topic `billingKycStatus` with T&C + `kycVerified`

Live EWAG topics are not required: use unit/integration tests + Mock CGW harness (INT-441). EWAG submission stays a later packaging step.

## Automated coverage (must stay green)

| Step | Where |
|---|---|
| Actor EWDS ingest | `services/participants` actor-sync / ewds adapter specs |
| Profile 409 for `source=ewds` | `participants.service.spec` INT-447 |
| acceptTerms (member) + `UserAccountStatusChanged` | `participants.service.spec` REQ-050 / INT-453 |
| acceptTermsForActor (command target) | `participants.service.spec` INT-453 |
| KYC apply keeps T&C on UserAccount event | `participants.service.spec` INT-453 |
| Command authorize + dispatch acceptTerms | `services/publication` command-* specs INT-447 |
| `UserAccountStatusChanged` → `billingKycStatus` merge | `ewds-topic-payload.spec` INT-448 |
| Mock CGW acceptTerms request/reply shapes | `packages/ewds-client` `mock-cgw-scenarios` |

## Manual / cluster check (optional when CGW is live)

On `k8s-intelligent-eu-dev`, with Billing CGW connected:

1. Publish one `actor` message (or use mock publisher)
2. Send `billingCommandRequest` `acceptTerms`
3. Observe `billingCommandReply` success and a `billingKycStatus` record with non-null `termsVersion`

Until EWAG grants land, the automated table above is the gate.
