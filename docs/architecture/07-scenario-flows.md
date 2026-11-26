---
title: "Billing & Payment Service — Scenario flows"
view: scenarios
status: draft
version: 1.2
date: 2026-11-26
spec_baseline: "requirements v6.1 + INT-447 / INT-448"
jira: INT-449, INT-450, INT-451
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

**Convention:** every EWDS publish/subscribe/command for billing goes `EWDS ↔ Billing CGW ↔ AC-*`. Stripe webhooks and IdP calls do **not** use Billing CGW.

**Ontology on arrows:** each message is annotated with the ontology class(es) or wire subset involved (`int:Actor`, `int:UserAccount`, …). Commands are actions, not record classes — listed as `command` + the UserAccount / Invoice fields they mutate.

| Shorthand | Ontology / wire |
|---|---|
| `int:Actor` | Actor (+ Address, ContactDetails on the same topic) |
| `int:UserAccount` | UserAccount subset on topic `billingKycStatus` (kycVerified + T&C) |
| `int:Billing` | Monthly statement → topic `billingStatement` |
| `int:Invoice` | Pair invoice → topic `billingInvoice` |
| `int:Payment` | → topic `billingPayment` |
| `int:Payout` | Extension → topic `billingPayout` |
| `int:EnergyTrade` | Settled trade intake |
| `int:Tariff` | Tariff catalogue (when published) |
| `int:Community` | Community billing settings (BPS-owned, not an EWDS record in V1) |

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
  Mgr->>R2M: Enter actors UI or CSV
  Note right of Mgr: int:Actor create
  loop One message per Actor
    R2M->>EWDS: publish topic actor
    Note right of R2M: int:Actor Address ContactDetails
    EWDS->>CGW: deliver actor
    CGW->>AC03: ActorSourcePort.ingest
    AC03->>AC03: upsert ParticipantRecord source=ewds
    Note right of AC03: cache int:Actor
    AC03->>IdP: ensure user + invitation
    AC03->>AC11: invite e-mail ids only
  end
  Note over CGW,AC03: No Actor reply topic — intake only
```

| Step | Ontology objects |
|---|---|
| Manager enters / CSV row | `int:Actor`, `Address`, `ContactDetails` |
| EWDS topic `actor` | same |
| BPS ParticipantRecord | cache of Actor; UserAccount not yet complete |

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
  Member->>R2M: Edit name address contacts
  Note right of Member: int:Actor update
  R2M->>EWDS: publish actor same actorId new version
  Note right of R2M: int:Actor Address ContactDetails
  EWDS->>CGW: deliver actor
  CGW->>AC03: ActorSourcePort.ingest update
  AC03->>AC03: replace profile cache source=ewds
  Note over Member,AC03: PUT /v1/me/profile → 409 profile_managed_by_ewds
```

| Step | Ontology objects |
|---|---|
| Edit in R2M | `int:Actor` (+ Address / ContactDetails) |
| EWDS republish | same — **not** UserAccount |
| BPS cache | Actor cache replaced |

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
  Member->>R2M: Accept T and C
  Note right of Member: int:UserAccount T and C fields
  R2M->>EWDS: billingCommandRequest acceptTerms
  Note right of R2M: command → UserAccount.terms*
  EWDS->>CGW: deliver command
  CGW->>AC10: poll receive command
  AC10->>AC10: authorize channel DID actor role
  AC10->>AC03: POST terms-acceptance
  AC03->>AC03: store termsVersion selfBillingMandate termsAcceptedAt
  Note right of AC03: int:UserAccount
  AC03->>AC10: UserAccountStatusChanged outbox
  AC10->>CGW: billingCommandReply accepted
  CGW->>EWDS: publish reply
  AC10->>CGW: publish billingKycStatus
  Note right of AC10: int:UserAccount wire
  CGW->>EWDS: publish record
  R2M->>EWDS: subscribe billingKycStatus
```

| Step | Ontology objects |
|---|---|
| acceptTerms payload | mutates `int:UserAccount` (`termsVersion`, `termsAcceptedAt`, `selfBillingMandate`) |
| `billingKycStatus` publish | `int:UserAccount` (+ current `kycVerified`) |
| Actor | unchanged |

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
  Member->>R2M: startKyc or setupPaymentMethod
  Note right of Member: int:UserAccount.kycVerified
  R2M->>EWDS: billingCommandRequest
  EWDS->>CGW: deliver command
  CGW->>AC10: poll receive
  AC10->>AC07: dispatch
  AC07->>Stripe: Account Link Checkout Identity SetupIntent
  AC07-->>AC10: PspHandoff
  AC10->>CGW: billingCommandReply + PspHandoff
  CGW->>EWDS: publish reply
  R2M-->>Member: hosted or embedded Stripe
  Member->>Stripe: complete KYC or payment method
  Stripe-->>AC07: webhook
  AC07->>AC03: apply kyc / payment ready
  Note right of AC03: int:UserAccount.kycVerified
  AC03->>AC10: UserAccountStatusChanged
  AC10->>CGW: publish billingKycStatus
  Note right of CGW: int:UserAccount
  CGW->>EWDS: publish record
```

| Step | Ontology objects |
|---|---|
| startKyc / setupPaymentMethod | drives `int:UserAccount.kycVerified` / payment readiness |
| Stripe | PSP evidence (not published as ontology) |
| `billingKycStatus` | `int:UserAccount` |

**Trace:** REQ-051, REQ-040, REQ-045, A7-bis.

---

## S5 — Readiness to Ready (gates)

Derived state on BPS (not a separate ontology class). Gates map to Actor / UserAccount fields.

```mermaid
%% elk %%
stateDiagram-v2
  [*] --> Invited: Actor ingested
  Invited --> ProfileCompleted: Actor profile complete
  ProfileCompleted --> TermsAccepted: acceptTerms UserAccount T and C
  TermsAccepted --> Ready: payment method + UserAccount.kycVerified
  Ready --> Restricted: KYC revoked or payment blocked
  Restricted --> Ready: restored
  Ready --> Offboarded: manager offboard
  TermsAccepted --> Offboarded: manager offboard
```

| Gate | Ontology objects |
|---|---|
| Invited / ProfileCompleted | `int:Actor` |
| TermsAccepted | `int:UserAccount` T&C fields |
| Ready | `int:UserAccount.kycVerified` + payment method |

Ready also requires BR-09 before invoices / statements / payouts.

---

## S6 — Settled trade intake

```mermaid
sequenceDiagram
  participant GSY as GSY DEX CGW
  participant EWDS as EWDS broker
  participant CGW as Billing CGW
  participant AC04 as AC-04 Trade intake
  participant AC05 as AC-05 Settlement
  GSY->>EWDS: publish settled trades
  Note right of GSY: int:EnergyTrade
  EWDS->>CGW: deliver
  CGW->>AC04: MarketPort receive
  AC04->>AC04: attribute via registry actorId
  Note right of AC04: EnergyTrade ↔ Actor
  AC04->>AC05: trades available for period
  Note over AC04: Unknown party flagged not invoiced REQ-058
```

| Step | Ontology objects |
|---|---|
| Market publish | `int:EnergyTrade` (+ Market / ClearingResult) |
| Attribution | links to `int:Actor` via registry |

**Trace:** REQ-001, REQ-041, REQ-058, BR-01.

---

## S7 — Periodic billing run (two-level model)

```mermaid
sequenceDiagram
  actor Op as Manager or operator
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
    Note right of Op: int:Community period
    R2M->>EWDS: billingCommandRequest
    EWDS->>CGW: deliver command
    CGW->>AC10: poll dispatch AC-14 or AC-05
  else Temporal schedule
    AC14->>AC05: StartBillingRun
  end
  AC05->>AC05: net pairs threshold carry-forward
  Note right of AC05: EnergyTrade → pair amounts
  AC05->>AC06: issue pair invoices + statements
  Note right of AC06: int:Invoice + int:Billing
  AC06->>AC06: legal numbers PDF
  AC06->>AC11: e-mail invoice
  AC06->>AC10: InvoiceIssued StatementIssued
  AC10->>CGW: publish billingInvoice + billingStatement
  Note right of CGW: int:Invoice int:Billing
  CGW->>EWDS: publish records
```

| Step | Ontology objects |
|---|---|
| Run scope | `int:Community`, period |
| Inputs | `int:EnergyTrade` (+ optional `int:Tariff`) |
| Outputs | `int:Invoice` (`billingInvoice`), `int:Billing` (`billingStatement`) |

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
  Cons->>R2M: startPayment invoiceId
  Note right of Cons: int:Invoice + int:Payment
  R2M->>EWDS: billingCommandRequest startPayment
  EWDS->>CGW: deliver command
  CGW->>AC10: poll receive
  AC10->>AC07: create charge on connected account
  AC07-->>AC10: PspHandoff
  AC10->>CGW: billingCommandReply
  CGW->>EWDS: publish reply
  Cons->>Stripe: pay hosted or embedded
  Stripe-->>AC07: payment_intent webhook
  AC07->>AC10: PaymentStatusChanged
  Note right of AC07: int:Payment
  AC10->>CGW: billingPayment + invoice status
  Note right of AC10: int:Payment int:Invoice
  CGW->>EWDS: publish records
```

| Step | Ontology objects |
|---|---|
| Command | targets `int:Invoice` |
| Result | `int:Payment`; invoice status on `int:Invoice` |
| Trade | **unchanged** (BR-11) |

**Trace:** REQ-014, BR-11.

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
  AC07->>AC10: PaymentStatusChanged
  Note right of AC07: int:Payment failed
  AC10->>CGW: billingPayment failed
  CGW->>EWDS: publish record
  Mgr->>R2M: sendReminder
  Note right of Mgr: int:Invoice reminder
  R2M->>EWDS: billingCommandRequest sendReminder
  EWDS->>CGW: deliver command
  CGW->>AC10: poll authorize manager
  AC10->>AC07: reminder notify
  AC10->>CGW: billingCommandReply
  CGW->>EWDS: publish reply
```

| Step | Ontology objects |
|---|---|
| Failure publish | `int:Payment` |
| Reminder | references `int:Invoice` / `int:Actor` |

**Trace:** REQ-016, REQ-017, REQ-046, REQ-061.

---

## S10 — Payout / withdrawal

```mermaid
sequenceDiagram
  actor Prod as Producer or prosumer
  participant R2M as R2M UI + CGW
  participant EWDS as EWDS broker
  participant CGW as Billing CGW
  participant AC10 as AC-10 Publication
  participant AC07 as AC-07 Payments
  participant Stripe as Stripe
  Prod->>R2M: requestWithdrawal or autoPayout
  Note right of Prod: int:Payout + int:Invoice Paid gate
  R2M->>EWDS: billingCommandRequest requestWithdrawal
  EWDS->>CGW: deliver command
  CGW->>AC10: poll receive
  AC10->>AC07: BR-14 check period invoices Paid
  Note right of AC07: int:Invoice Paid
  AC07->>Stripe: create payout from Connect balance
  Stripe-->>AC07: payout webhook
  AC07->>AC10: PayoutStatusChanged
  AC10->>CGW: billingPayout
  Note right of CGW: int:Payout
  CGW->>EWDS: publish record
```

| Step | Ontology objects |
|---|---|
| Gate BR-14 | `int:Invoice` (producer, Paid) |
| Result | `int:Payout` on `billingPayout` |

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
  Mgr->>R2M: setInvoiceStatus reason mandatory
  Note right of Mgr: int:Invoice status
  R2M->>EWDS: billingCommandRequest
  EWDS->>CGW: deliver command
  CGW->>AC10: poll authorize manager
  AC10->>AC06: patch status + audit
  AC06->>AC10: InvoiceStatusChanged
  AC10->>CGW: billingInvoice + billingCommandReply
  Note right of CGW: int:Invoice
  CGW->>EWDS: publish
```

| Step | Ontology objects |
|---|---|
| Command / publish | `int:Invoice` |

**Trace:** REQ-044, US-041.

---

## S12 — Data-subject erasure

Erasure can start from the compliance portal (reference `/v1`) or from an EWDS erasure intake. The EWDS path still goes through **Billing CGW**.

```mermaid
sequenceDiagram
  actor DPO as DPO or manager
  participant Portal as Portal or R2M
  participant EWDS as EWDS broker
  participant CGW as Billing CGW
  participant AC12 as AC-12 Compliance
  participant AC03 as AC-03 Participants
  participant AC07 as AC-07 Payments
  participant IdP as Keycloak
  participant Stripe as Stripe
  alt Reference portal
    DPO->>AC12: erasure request participantId
    Note right of DPO: targets int:Actor id
  else EWDS erasure intake
    Portal->>EWDS: erasure request message
    EWDS->>CGW: deliver
    CGW->>AC12: ErasurePort.ingest
  end
  AC12->>AC03: ErasureRequested
  AC03->>AC03: purge personal fields keep invoices
  Note right of AC03: clear Actor PII cache keep Invoice ids
  AC12->>AC07: erase PSP customer where allowed
  AC07->>Stripe: delete or anonymise
  AC12->>IdP: erase user
  AC03-->>AC12: ErasureCompleted
```

| Step | Ontology objects |
|---|---|
| Target | `int:Actor` / UserAccount personal cache |
| Retained | `int:Invoice` identifiers for legal retention |
| Not erased from history | published billing records already purged by retention (REQ-053) |

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
  L3 -->|ok| DISP[Dispatch to AC-03 AC-05 AC-06 AC-07 AC-14]
  L3 -->|deny| REJ[billingCommandReply denied via CGW]
  DISP --> REPLY[billingCommandReply optional PspHandoff via CGW]
```

| Operation | Ontology objects touched |
|---|---|
| `acceptTerms` | `int:UserAccount` T&C |
| `startKyc` / `setupPaymentMethod` | `int:UserAccount.kycVerified` |
| `startPayment` | `int:Invoice`, `int:Payment` |
| `requestWithdrawal` | `int:Payout`, gated by `int:Invoice` |
| `setInvoiceStatus` | `int:Invoice` |
| `sendReminder` | references `int:Invoice` / `int:Actor` |
| `triggerBillingRun` | `int:Community` → produces `int:Billing` + `int:Invoice` |
| Actor create/update | **not a command** — topic `actor` / `int:Actor` |

**Trace:** REQ-052.

---

## S14 — Publication purge (≤ 7 days)

```mermaid
sequenceDiagram
  participant AC14 as AC-14 Scheduler
  participant AC10 as AC-10 Publication
  participant CGW as Billing CGW cache
  AC14->>AC10: PurgeCache before
  AC10->>CGW: drop cached outbound
  Note right of CGW: Billing Invoice Payment Payout UserAccount wire copies
```

| Step | Ontology objects |
|---|---|
| Cached outbound | wire copies of `int:Billing`, `int:Invoice`, `int:Payment`, `int:Payout`, `int:UserAccount` |

**Trace:** REQ-053.

---

## Index by requirement / UAT

| Scenario | Primary REQ / UAT | Main ontology |
|---|---|---|
| S1 Onboard | REQ-008 / UAT-008 | `int:Actor` |
| S2 Profile update | REQ-009 / UAT-009 | `int:Actor` |
| S3 Terms | REQ-050 / UAT-062 | `int:UserAccount` |
| S4 KYC / PM | REQ-051 / REQ-040 | `int:UserAccount` |
| S5 Readiness | REQ-045 | `int:Actor`, `int:UserAccount` |
| S6 Trades | REQ-001 | `int:EnergyTrade` |
| S7 Billing run | REQ-054 / REQ-059 | `int:Billing`, `int:Invoice` |
| S8 Pay | REQ-014 | `int:Payment`, `int:Invoice` |
| S9 Failure | REQ-016 / REQ-061 | `int:Payment`, `int:Invoice` |
| S10 Payout | REQ-015 | `int:Payout` |
| S11 Invoice status | REQ-044 | `int:Invoice` |
| S12 Erasure | REQ-013 | `int:Actor`, `int:UserAccount`, `int:Invoice` |
| S13 Commands | REQ-052 | `int:Actor`, `int:UserAccount`, `int:Invoice`, `int:Payment`, `int:Payout`, `int:Billing`, `int:Community` |
| S14 Purge | REQ-053 | `int:Billing`, `int:Invoice`, `int:Payment`, `int:Payout`, `int:UserAccount` |
