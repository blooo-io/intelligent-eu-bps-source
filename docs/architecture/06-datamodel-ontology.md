---
title: "Billing & Payment Service — Ontology datamodel"
view: datamodel
status: draft
version: 1.0
date: 2026-11-26
spec_baseline: "requirements v6.1 + INT-447 / INT-448"
jira: INT-449
---
# Ontology datamodel (Actor ↔ UserAccount ↔ billing)

> Supplement to the five architecture views ([README](README.md)).
> Answers: **which ontology classes exist, how they relate, who masters each, and which EWDS topic carries them.**
> Decisions locked: **INT-447** (Actor EWDS-only), **INT-448** (T&C on UserAccount / `billingKycStatus`).

## 1. Two identity layers (do not conflate)

| Layer | Ontology | Master | BPS role | EWDS wire |
|---|---|---|---|---|
| **Administrative energy identity** | `int:Actor` (+ `Address`, `ContactDetails`) | Project UI (**R2M**) / consortium | **Intake only** (`ActorSourcePort`) | Topic `actor` |
| **Billing / payment account readiness** | `int:UserAccount` | **BPS** (mirrors Stripe KYC + stores T&C) | Writes + publishes | Topic `billingKycStatus` |

```mermaid
%% elk %%
flowchart TB
  R2M[R2M project UI] -->|publish create/update| ACTOR[topic actor<br/>int:Actor]
  ACTOR -->|ActorSourcePort| BPS_P[AC-03 Participants]
  BPS_P -->|local ParticipantRecord| UA[UserAccount fields<br/>kycVerified + T&amp;C]
  STRIPE[(Stripe Connect / Identity)] -->|KycStatusChanged| BPS_PAY[AC-07 Payments]
  BPS_PAY -->|applyKyc| BPS_P
  BPS_P -->|UserAccountStatusChanged| BPS_PUB[AC-10 Publication]
  BPS_PAY -->|KycStatusChanged| BPS_PUB
  BPS_PUB -->|publish| KYC[topic billingKycStatus<br/>UserAccount subset]
  R2M -->|subscribe| KYC
```

**Rules of thumb**
- Changing name / address / contacts / meter / role → **republish `actor`** (never `updateProfile` on the project path).
- Accepting T&C / self-billing mandate → **command `acceptTerms`**; status appears on **`billingKycStatus`**.
- KYC / payment method → commands `startKyc` / `setupPaymentMethod`; status appears on **`billingKycStatus`** (`kycVerified`).

## 2. Ontology class map (billing-relevant)

```mermaid
%% elk %%
classDiagram
  direction TB
  class Community {
    +communityId
    +currency
    +billingPeriod
    +threshold
    +vatRate
    +billingMode live|virtual
    +autoPayout
  }
  class Actor {
    +actorId
    +name
    +type
    +role Consumer|Producer|Prosumer
    +communityId
    +meterId
    +marketActorId
  }
  class Address {
    +line1
    +city
    +postalCode
    +country
  }
  class ContactDetails {
    +email
    +phone
  }
  class UserAccount {
    +actorId
    +kycVerified
    +accountStatus
    +termsVersion
    +termsAcceptedAt
    +selfBillingMandate
  }
  class EnergyTrade {
    +tradeId
    +buyerActorId
    +sellerActorId
    +kWh
    +price
    +status settled
  }
  class Billing {
    +billingId
    +actorId
    +period
    +billingStatus
    +netBalance
  }
  class Invoice {
    +invoiceId
    +invoiceIssuedBy
    +invoiceIssuedTo
    +period
    +amounts
  }
  class Payment {
    +paymentId
    +invoiceId
    +paymentStatus
  }
  class Payout {
    +payoutId
    +actorId
    +amount
    +payoutStatus
  }
  class Tariff {
    +tariffId
    +communityId
    +gridFee
  }
  Community "1" --> "*" Actor : has members
  Actor "1" --> "0..1" Address : has
  Actor "1" --> "0..1" ContactDetails : has
  Actor "1" --> "0..1" UserAccount : readiness for
  Community "1" --> "*" EnergyTrade : market of
  Actor --> EnergyTrade : buyer / seller
  Community "1" --> "*" Billing : statements
  Actor "1" --> "*" Billing : member statement
  Billing "1" --> "*" Invoice : lists
  Invoice --> Actor : issuedBy producer
  Invoice --> Actor : issuedTo consumer
  Invoice "1" --> "*" Payment : settled by
  Actor "1" --> "*" Payout : receives
  Community "1" --> "*" Tariff : publishes
```

## 3. Logical ER (BPS internal projections)

Identifiers only on the wire; personal fields stay in AC-03 / Stripe.

```mermaid
%% elk %%
erDiagram
  COMMUNITY ||--o{ ACTOR : has
  ACTOR ||--o| USER_ACCOUNT : "readiness (BPS)"
  ACTOR ||--o| ADDRESS : has
  ACTOR ||--o| CONTACT : has
  ACTOR ||--o| REGISTRY : "market + meter"
  COMMUNITY ||--o{ BILLING_RUN : runs
  BILLING_RUN ||--o{ STATEMENT : "int:Billing"
  STATEMENT }o--o{ INVOICE : lists
  INVOICE }o--|| ACTOR : "issuedTo consumer"
  INVOICE }o--|| ACTOR : "issuedBy producer"
  INVOICE }o--o{ TRADE : covers
  INVOICE ||--o{ PAYMENT : settled_by
  ACTOR ||--o{ PAYOUT : receives
  ACTOR ||--o{ CARRY_FORWARD : pair_balance
  COMMUNITY ||--o{ TARIFF : optional
```

### Field ownership

| Concept | Stored in BPS | Master outside BPS | Notes |
|---|---|---|---|
| Actor name, address, contacts, role, meter, market id | Cache / registry on ParticipantRecord (`source=ewds`) | R2M via `actor` | `PUT /me/profile` → `409 profile_managed_by_ewds` |
| `termsVersion`, `termsAcceptedAt`, `selfBillingMandate` | ParticipantRecord | BPS (command `acceptTerms`) | Same level as KYC (UserAccount) |
| `kycVerified`, payment-account readiness | ParticipantRecord + payments cache | Stripe (via AC-07) | Published on `billingKycStatus` |
| Invoice PDF, legal number | Invoicing | BPS | Legal number **not** on EWDS |
| Stripe customer / Connect ids | Payments | Stripe | Never published (NFR-004) |
| Trade status | Read-only intake | GSY DEX | BR-11 — billing never mutates |

## 4. EWDS topic ↔ ontology mapping

| Topic | Ontology class / subset | Publisher | Subscriber (project path) |
|---|---|---|---|
| `actor` | `Actor`, `Address`, `ContactDetails` | R2M | BPS AC-03 |
| `tariff` | `Tariff` | Consortium / Blooo (when granted) | BPS AC-13 |
| `billingStatement` | `Billing` | BPS AC-10 | R2M |
| `billingInvoice` | `Invoice` (+ billingMode, amounts) | BPS AC-10 | R2M |
| `billingPayment` | `Payment` | BPS AC-10 | R2M |
| `billingPayout` | `Payout` (extension) | BPS AC-10 | R2M |
| `billingKycStatus` | **`UserAccount` subset** (`kycVerified` + T&C) | BPS AC-10 | R2M |
| `billingCommandRequest` / `Reply` | Actions (not records) | R2M ↔ BPS | — |

Schemas: [`ewds-topics/`](ewds-topics/README.md).

## 5. UserAccount record shape (`billingKycStatus`)

| Field | Meaning |
|---|---|
| `actorId` | Same UUID as Actor / participantId |
| `communityId` | Community scope |
| `kycVerified` | Stripe Identity / Connect verified |
| `accountStatus` | e.g. Active / PendingVerification |
| `verificationKind` | `connect_account` \| Identity |
| `termsVersion` | Accepted T&C version or `null` |
| `termsAcceptedAt` | ISO timestamp or `null` |
| `selfBillingMandate` | Required true for producer/prosumer before invoices in their name (BR-09) |
| `updatedAt` | Last change |

Write path for T&C: command channel `acceptTerms` → AC-03 → `UserAccountStatusChanged` → AC-10 merge-publish.

## 6. Readiness vs ontology

Participant readiness (BPS) is derived, not a separate ontology class:

`Invited → ProfileCompleted → TermsAccepted → Ready` (and `Restricted` / `Offboarded`).

| Gate | Backed by |
|---|---|
| Profile completed | Actor intake (name/address/contacts present) |
| Terms accepted | UserAccount T&C fields |
| Ready | T&C + payment method + `kycVerified` (REQ-045) |

## 7. Validation checklist
- [ ] Actor ≠ UserAccount is explicit for R2M integrators
- [ ] No project-path CSV/profile REST on BPS (INT-447)
- [ ] T&C published with KYC on `billingKycStatus` (INT-448)
- [ ] Diagrams use Mermaid + `%% elk %%` where required
