---
title: "Billing & Payment Service — Scenario flows"
view: scenarios
status: draft
version: 1.1
date: 2026-11-26
spec_baseline: "requirements v6.1 + INT-447 / INT-448"
jira: INT-449, INT-450
---
# Detailed scenario flows

> Supplement to the five architecture views ([README](README.md)).
> Datamodel / ontology: [`06-datamodel-ontology.md`](06-datamodel-ontology.md).
> All project-UI paths are **EWDS-only** (records + command channel). `/v1` is the reference client (`apps/web`) only.

## Legend (lifelines)

| Label | Meaning |
|---|---|
| **R2M UI + CGW** | Project UI talking through **its** Client Gateway |
| **EWDS broker** | Energy Web Digital Spine message broker |
| **Billing CGW** | **Blooo BPS** Client Gateway — **always** on the path between EWDS and BPS modules (INT-450) |
| **AC-xx** | NestJS modules inside BPS (behind Billing CGW for all EWDS I/O) |

**Convention:** every EWDS publish/subscribe/command for billing goes `EWDS ↔ Billing CGW ↔ AC-*`. Diagrams never imply a direct EWDS→module hop. Stripe webhooks and IdP calls do **not** use Billing CGW (they are bilateral to BPS).

---

## S1 — Onboard participants (Actor create)

R2M is the sole create entry point. CSV in R2M → N `actor` messages.

```mermaid
sequenceDiagram
  actor Mgr as Community manager
  participant R2M as R2M UI + CGW
  participant EWDS as EWDS broker
  participant CGW as Billing CGW
  participant AC03 as AC-03 Participants
  participant IdP as Keycloak
  participant AC11 as AC-11 Notification
  Mgr->>R2M: Enter actors (UI or CSV)
  loop One message per Actor
    R2M->>EWDS: publish topic actor
    EWDS->>CGW: deliver actor
    CGW->>AC03: ActorSourcePort.ingest
    AC03->>AC03: upsert ParticipantRecord source=ewds
    AC03->>IdP: ensure user + invitation
    AC03->>AC11: invite e-mail (ids only in events)
  end
  Note over CGW,AC03: No Actor reply topic — intake only
```

**Trace:** REQ-008, UAT-008, INT-447.

---

## S2 — Update administrative profile (Actor republish)

```mermaid
sequenceDiagram
  actor Member as Member
  participant R2M as R2M UI + CGW
  participant EWDS as EWDS broker
  participant CGW as Billing CGW
  participant AC03 as AC-03 Participants
  Member->>R2M: Edit name / address / contacts
  R2M->>EWDS: publish actor (same actorId, new version)
  EWDS->>CGW: deliver actor
  CGW->>AC03: ActorSourcePort.ingest update
  AC03->>AC03: replace profile cache (source=ewds)
  Note over Member,AC03: PUT /v1/me/profile returns 409 profile_managed_by_ewds
```

**Trace:** REQ-009, UAT-009, INT-447.

---

## S3 — Accept T&C / self-billing mandate

Write via command channel; read via `billingKycStatus` (UserAccount).

```mermaid
sequenceDiagram
  actor Member as Member
  participant R2M as R2M UI + CGW
  participant EWDS as EWDS broker
  participant CGW as Billing CGW
  participant AC10 as AC-10 Publication
  participant AC03 as AC-03 Participants
  Member->>R2M: Accept T&amp;C (+ self-billing if producer)
  R2M->>EWDS: billingCommandRequest acceptTerms
  EWDS->>CGW: deliver command
  CGW->>AC10: poll / receive command
  AC10->>AC10: authorize (channel, DID, actor role)
  AC10->>AC03: POST .../terms-acceptance
  AC03->>AC03: store termsVersion, selfBillingMandate, termsAcceptedAt
  AC03->>AC10: UserAccountStatusChanged (outbox)
  AC10->>CGW: send billingCommandReply accepted
  CGW->>EWDS: publish reply
  AC10->>CGW: publish billingKycStatus (T&amp;C + kycVerified)
  CGW->>EWDS: publish record
  R2M->>EWDS: subscribe billingKycStatus
```

**Trace:** REQ-050, UAT-062, INT-448, BR-09.

---

## S4 — KYC / payment-method setup (PspHandoff)

```mermaid
sequenceDiagram
  actor Member as Member
  participant R2M as R2M UI + CGW
  participant EWDS as EWDS broker
  participant CGW as Billing CGW
  participant AC10 as AC-10 Publication
  participant AC07 as AC-07 Payments
  participant Stripe as Stripe
  participant AC03 as AC-03 Participants
  Member->>R2M: startKyc or setupPaymentMethod (surface hosted|embedded)
  R2M->>EWDS: billingCommandRequest
  EWDS->>CGW: deliver command
  CGW->>AC10: poll / receive
  AC10->>AC07: dispatch
  AC07->>Stripe: Account Link / Checkout / Identity / SetupIntent
  AC07-->>AC10: PspHandoff (url or clientSecret)
  AC10->>CGW: billingCommandReply + PspHandoff
  CGW->>EWDS: publish reply
  R2M-->>Member: hosted redirect or embedded Stripe.js
  Member->>Stripe: complete KYC / card / SEPA
  Stripe-->>AC07: webhook (account.updated / identity / setup)
  AC07->>AC07: emit KycStatusChanged / PaymentAccountStatusChanged
  AC07->>AC03: apply kyc / payment ready
  AC03->>AC10: UserAccountStatusChanged (full snapshot)
  AC10->>CGW: publish billingKycStatus
  CGW->>EWDS: publish record
```

**Trace:** REQ-051, REQ-040, REQ-045, A7-bis.

---

## S5 — Readiness to Ready (gates)

```mermaid
%% elk %%
stateDiagram-v2
  [*] --> Invited: Actor ingested
  Invited --> ProfileCompleted: Actor profile complete
  ProfileCompleted --> TermsAccepted: acceptTerms
  TermsAccepted --> Ready: payment method + kycVerified
  Ready --> Restricted: KYC revoked / payment blocked
  Restricted --> Ready: restored
  Ready --> Offboarded: manager offboard
  TermsAccepted --> Offboarded: manager offboard
```

Ready also requires BR-09 gates before invoices / statements / payouts.

---

## S6 — Settled trade intake

```mermaid
sequenceDiagram
  participant GSY as GSY DEX CGW
  participant EWDS as EWDS broker
  participant CGW as Billing CGW
  participant AC04 as AC-04 Trade intake
  participant AC05 as AC-05 Settlement
  GSY->>EWDS: publish settled trades / clearing
  EWDS->>CGW: deliver
  CGW->>AC04: MarketPort receive
  AC04->>AC04: attribute via registry (actorId)
  AC04->>AC05: trades available for period
  Note over AC04: Unknown party → flagged, not invoiced (REQ-058)
```

**Trace:** REQ-001, REQ-041, REQ-058, BR-01.

---

## S7 — Periodic billing run (two-level model)

```mermaid
sequenceDiagram
  actor Op as Manager / operator / scheduler
  participant R2M as R2M UI + CGW
  participant EWDS as EWDS broker
  participant CGW as Billing CGW
  participant AC14 as AC-14 Scheduler
  participant AC05 as AC-05 Settlement
  participant AC06 as AC-06 Invoicing
  participant AC10 as AC-10 Publication
  participant AC11 as AC-11 Notification
  alt Project UI trigger
    Op->>R2M: triggerBillingRun
    R2M->>EWDS: billingCommandRequest
    EWDS->>CGW: deliver command
    CGW->>AC10: poll → dispatch AC-14/AC-05
  else Temporal schedule / operator
    AC14->>AC05: StartBillingRun(community, period)
  end
  AC05->>AC05: net pairs, threshold carry-forward (BR-04..08)
  AC05->>AC06: issue pair invoices + statements
  AC06->>AC06: legal numbers, PDF (BR-10)
  AC06->>AC11: e-mail invoice
  AC06->>AC10: InvoiceIssued / StatementIssued
  AC10->>CGW: publish billingInvoice + billingStatement
  CGW->>EWDS: publish records
```

**Trace:** REQ-054, REQ-059, REQ-005, REQ-048.

---

## S8 — Pay an invoice

```mermaid
sequenceDiagram
  actor Cons as Consumer
  participant R2M as R2M UI + CGW
  participant EWDS as EWDS broker
  participant CGW as Billing CGW
  participant AC10 as AC-10 Publication
  participant AC07 as AC-07 Payments
  participant Stripe as Stripe
  Cons->>R2M: startPayment(invoiceId, surface)
  R2M->>EWDS: billingCommandRequest startPayment
  EWDS->>CGW: deliver command
  CGW->>AC10: poll / receive
  AC10->>AC07: create PaymentIntent / Checkout on connected account
  AC07-->>AC10: PspHandoff
  AC10->>CGW: billingCommandReply
  CGW->>EWDS: publish reply
  Cons->>Stripe: pay (hosted or embedded)
  Stripe-->>AC07: payment_intent.* webhook
  AC07->>AC07: PaymentStatusChanged
  AC07->>AC10: publish path
  AC10->>CGW: billingPayment (+ invoice status)
  CGW->>EWDS: publish records
```

**Trace:** REQ-014, BR-11 (trade status untouched).

---

## S9 — Payment failure & reminder

```mermaid
sequenceDiagram
  participant Stripe as Stripe
  participant AC07 as AC-07 Payments
  participant AC10 as AC-10 Publication
  participant CGW as Billing CGW
  participant EWDS as EWDS broker
  participant R2M as R2M UI + CGW
  actor Mgr as Manager
  Stripe-->>AC07: payment failed webhook
  AC07->>AC07: failureCategory + notify
  AC07->>AC10: PaymentStatusChanged
  AC10->>CGW: billingPayment (failed)
  CGW->>EWDS: publish record
  Mgr->>R2M: sendReminder
  R2M->>EWDS: billingCommandRequest sendReminder
  EWDS->>CGW: deliver command
  CGW->>AC10: poll / authorize manager
  AC10->>AC07: reminder / AC-11 notify
  AC10->>CGW: billingCommandReply
  CGW->>EWDS: publish reply
```

**Trace:** REQ-016, REQ-017, REQ-046, REQ-061.

---

## S10 — Payout / withdrawal

```mermaid
sequenceDiagram
  actor Prod as Producer / prosumer
  participant R2M as R2M UI + CGW
  participant EWDS as EWDS broker
  participant CGW as Billing CGW
  participant AC10 as AC-10 Publication
  participant AC07 as AC-07 Payments
  participant Stripe as Stripe
  Prod->>R2M: requestWithdrawal (or autoPayout)
  R2M->>EWDS: billingCommandRequest requestWithdrawal
  EWDS->>CGW: deliver command
  CGW->>AC10: poll / receive
  AC10->>AC07: BR-14 check period invoices Paid
  AC07->>Stripe: create payout from Connect balance
  Stripe-->>AC07: payout.* webhook
  AC07->>AC10: PayoutStatusChanged
  AC10->>CGW: billingPayout
  CGW->>EWDS: publish record
```

**Trace:** REQ-015, REQ-060, BR-14.

---

## S11 — Manager invoice status change

```mermaid
sequenceDiagram
  actor Mgr as Community manager
  participant R2M as R2M UI + CGW
  participant EWDS as EWDS broker
  participant CGW as Billing CGW
  participant AC10 as AC-10 Publication
  participant AC06 as AC-06 Invoicing
  Mgr->>R2M: setInvoiceStatus (reason mandatory)
  R2M->>EWDS: billingCommandRequest
  EWDS->>CGW: deliver command
  CGW->>AC10: poll / authorize manager
  AC10->>AC06: patch status + audit
  AC06->>AC10: InvoiceStatusChanged
  AC10->>CGW: billingInvoice + billingCommandReply
  CGW->>EWDS: publish
```

**Trace:** REQ-044, US-041.

---

## S12 — Data-subject erasure

Erasure can be started from the compliance portal (`/v1`) or from an EWDS erasure intake. The EWDS path still goes through **Billing CGW**.

```mermaid
sequenceDiagram
  actor DPO as DPO / manager
  participant Portal as Portal / R2M
  participant EWDS as EWDS broker
  participant CGW as Billing CGW
  participant AC12 as AC-12 Compliance
  participant AC03 as AC-03 Participants
  participant AC07 as AC-07 Payments
  participant IdP as Keycloak
  participant Stripe as Stripe
  alt Reference portal
    DPO->>AC12: erasure request (participantId)
  else EWDS erasure intake
    Portal->>EWDS: erasure request message
    EWDS->>CGW: deliver
    CGW->>AC12: ErasurePort.ingest
  end
  AC12->>AC03: ErasureRequested
  AC03->>AC03: purge personal fields; keep invoices for legal retention
  AC12->>AC07: erase PSP customer where allowed
  AC07->>Stripe: delete / anonymise
  AC12->>IdP: erase user
  AC03-->>AC12: ErasureCompleted
```

**Trace:** REQ-013, NFR-015 (ids only in logs/events).

---

## S13 — Command channel (authorization layers)

Commands arrive on EWDS, are read by **Billing CGW**, then authorized/dispatched in AC-10.

```mermaid
%% elk %%
flowchart TB
  EWDS[EWDS broker] --> CGW[Billing CGW]
  CGW --> REQ[AC-10 receives billingCommandRequest]
  REQ --> L1[Layer 1: EWDS channel role]
  L1 --> L2[Layer 2: sender DID allow-list]
  L2 --> L3[Layer 3: actor role vs operation]
  L3 -->|ok| DISP[Dispatch to AC-03/05/06/07/14]
  L3 -->|deny| REJ[billingCommandReply denied via CGW]
  DISP --> REPLY[billingCommandReply + optional PspHandoff via CGW]
```

Operations (project path): `startPayment`, `requestWithdrawal`, `setInvoiceStatus`, `startKyc`, `acceptTerms`, `sendReminder`, `triggerBillingRun`, `setupPaymentMethod`.  
**Not** a command: Actor create/update (topic `actor` only).

---

## S14 — Publication purge (≤ 7 days)

```mermaid
sequenceDiagram
  participant AC14 as AC-14 Scheduler
  participant AC10 as AC-10 Publication
  participant CGW as Billing CGW cache
  AC14->>AC10: PurgeCache(before)
  AC10->>CGW: drop cached outbound ≤ 7 days (REQ-053)
```

---

## Index by requirement / UAT

| Scenario | Primary REQ / UAT |
|---|---|
| S1 Onboard | REQ-008 / UAT-008 |
| S2 Profile update | REQ-009 / UAT-009 |
| S3 Terms | REQ-050 / UAT-062 |
| S4 KYC / PM | REQ-051 / REQ-040 |
| S5 Readiness | REQ-045 |
| S6 Trades | REQ-001 |
| S7 Billing run | REQ-054 / REQ-059 |
| S8 Pay | REQ-014 |
| S9 Failure | REQ-016 / REQ-061 |
| S10 Payout | REQ-015 |
| S11 Invoice status | REQ-044 |
| S12 Erasure | REQ-013 |
| S13 Commands | REQ-052 |
| S14 Purge | REQ-053 |
