---
title: "Billing & Payment Service — Logical architecture"
view: logical
iteration: 2
status: revised
version: 2.0
date: 2026-11-25
baseline: "01-functional-architecture.md v2.0 (revised 2026-11-25); requirements v6.1; assumptions A1–A33"
---
# Billing & Payment Service: logical architecture

> **View 2 of 5** (functional → **logical** → application → technical → physical, see [README](README.md)).
> This view answers: **which logical blocks carry the functions of the [functional view](01-functional-architecture.md), what each block owns, and how blocks exchange information with each other and with external systems.**
> It stays technology-neutral. It does not decide how blocks are packaged (modules vs. services); that is decided in the application view.
> Status: **revised (2026-11-25), revalidation pending**.

## 1. Logical design principles

| # | Principle | Consequence |
|---|---|---|
| LP-1 | **One block, one responsibility, one owner of its data.** | A block never writes another block's data. It asks the owning block through an interface or reacts to its events. |
| LP-2 | **External systems are reached only through ports.** | Each external dependency (market, data space, payment provider, IdP, rates, mail) sits behind a logical port. A port can be implemented for real or by a mock without changing the blocks (A32). |
| LP-3 | **Commands synchronous, facts as events.** | Requests between blocks are commands. Facts that other blocks need are published as domain events (e.g. *InvoiceIssued*). |
| LP-4 | **Idempotency on every entry point.** | Trades are keyed by trade id, provider events by event id, and runs by (community, period, version). |
| LP-5 | **Immutable financial records.** | Billing runs, computed amounts and issued invoices are append-only. A correction creates a new version or a credit note (REQ-005, NFR-003). |
| LP-6 | **Personal data confined.** | Personal data lives only in the Participant block (profiles), the Invoicing block (PDF documents) and the Compliance block (audit). Every other block and every outbound message uses pseudonymous identifiers. |
| LP-7 | **Two entry points for clients.** | The project UI uses only the EWDS (records published by LB-08, commands on P-CMD). The reference client uses LB-12. Both reach the same commands (REQ-052). |

## 2. Logical blocks

The blocks are shown in three small diagrams, one per concern. One big diagram is unreadable in renderers that use the dagre layout, such as Obsidian.

**2.1 Overview by layer**

```mermaid
%% elk %%
flowchart TB
  subgraph Clients
    UI[Reference client]
    PUI[Project UI]
  end
  subgraph Access[Access layer]
    API[LB-12 Billing API]
    IAM[LB-01 Access control]
  end
  subgraph Core[Billing core]
    PCM[LB-02 Participants & communities]
    TIN[LB-03 Trade intake]
    SET[LB-04 Settlement engine]
    INV[LB-05 Invoicing]
    PAY[LB-06 Payment orchestration]
    REC[LB-07 Reconciliation]
    RPT[LB-14 Reporting & exports]
  end
  subgraph Support[Support blocks]
    PUB[LB-08 Publication]
    NOT[LB-09 Notification]
    CMP[LB-10 Compliance]
    REF[LB-11 Reference data]
    JOB[LB-13 Scheduling]
  end
  subgraph Ports[External ports]
    P1((Market)) ~~~ P2((Data space)) ~~~ P3((Payment)) ~~~ P4((IdP)) ~~~ P5((Rates)) ~~~ P6((Mail)) ~~~ P7((KPI export))
  end
  UI --> API
  PUI -. EWDS .-> P_CMD((P-CMD))
  P_CMD -. commands .-> API
  API --> IAM
  IAM --> Core
  Core --> Ports
  Support --> Ports
  Support -.- Core
```

**2.2 Main business flow** (from trades to payment and publication)

```mermaid
%% elk %%
flowchart LR
  MKT((P-MKT Market)) --> TIN[LB-03 Trade intake] --> SET[LB-04 Settlement] --> INV[LB-05 Invoicing] --> PAY[LB-06 Payment] --> PSP((P-PSP Stripe test/live))
  FX((P-FX Rates)) --> REF[LB-11 Reference data] --> SET
  PCM[LB-02 Participants] -. lookup .-> TIN
  PCM -. settings .-> SET
  PCM -. readiness .-> INV
  INV -- events --> PUB[LB-08 Publication] --> DS((P-DS Data space))
  PAY -- events --> PUB
  INV -- events --> NOT[LB-09 Notification] --> MAIL((P-MAIL Mail))
  PAY -- events --> NOT
```

**2.3 Access, control, reporting, scheduling and compliance**

```mermaid
%% elk %%
flowchart LR
  UI[Reference client] --> API[LB-12 Billing API]
  PUI[Project UI] -. EWDS .-> CMD((P-CMD))
  CMD -.-> API
  API --> IAM[LB-01 Access control] --> IDP((P-IDP IdP))
  API --> CORE[Core blocks LB-02..LB-06]
  API --> RPT[LB-14 Reporting & exports]
  REC[LB-07 Reconciliation] -. reads .-> DATA[(Invoices, payments, trades)]
  RPT -. reads .-> DATA
  RPT --> KPI((P-KPI KPI export))
  JOB[LB-13 Scheduling] -. triggers .-> OWN[Owning blocks, see 4.5]
  CMP[LB-10 Compliance] -. erasure .-> CORE
  CMP -. erasure .-> IAM
```


**2.4 Complete block map** (all dependencies in one diagram. It renders cleanly only with the ELK layout: in Obsidian, the *Mermaid ELK Renderer* plugin)

```mermaid
%% elk %%
flowchart TB
  subgraph Clients
    UI[Reference client]
    PUI[Project UI]
  end
  API[LB-12 Billing API]
  IAM[LB-01 Access control]
  subgraph Core[Billing core]
    PCM[LB-02 Participants & communities]
    TIN[LB-03 Trade intake]
    SET[LB-04 Settlement engine]
    INV[LB-05 Invoicing]
    PAY[LB-06 Payment orchestration]
    REC[LB-07 Reconciliation]
    RPT[LB-14 Reporting & exports]
  end
  subgraph Support[Support blocks]
    PUB[LB-08 Publication]
    NOT[LB-09 Notification]
    CMP[LB-10 Compliance]
    REF[LB-11 Reference data]
    JOB[LB-13 Scheduling]
  end
  UI --> API
  PUI -. EWDS .-> P_CMD((P-CMD))
  P_CMD -.-> API
  API --> IAM
  API --> PCM & SET & INV & PAY & RPT & CMP
  TIN --> PCM
  SET --> TIN & PCM & REF
  INV --> SET & PCM & PAY
  PAY --> PCM
  REC --> INV & PAY & TIN
  RPT --> INV & PAY & TIN & REC
  JOB -. triggers .-> TIN & SET & INV & REC & RPT & PUB & CMP & REF
  INV & PAY -. events .-> PUB
  PCM & INV & PAY -. events .-> NOT
  CMP -. erasure .-> PCM & PAY & IAM
  IAM -. port .- P_IDP((IdP port))
  TIN -. port .- P_MKT((Market port))
  PUB -. port .- P_DS((Data-space port))
  PAY -. port .- P_PSP((Payment port))
  REF -. port .- P_FX((Rates port))
  NOT -. port .- P_MAIL((Mail port))
  RPT -. port .- P_KPI((KPI export))
```

| Block | Responsibility | Owns (data) | Functions | Requirements |
|---|---|---|---|---|
| **LB-01 Access control** | Authorizes every EWDS command (CGW channel role, sender DID allow-list, actor role) and validates service JWTs on internal APIs. It does not authenticate end users: member OIDC is owned by the project UI (R2M), and no end-user JWT enters billing (INT-463) | Session context only (no persistence); service-JWT client configuration | F1.4 | REQ-033–037, REQ-049, REQ-010, NFR-011, NFR-013 |
| **LB-02 Participants & communities** | Community settings, Actor intake (EWDS-only), registry, billing-profile cache, **UserAccount** T&C + readiness, offboarding | Community, Participant, RegistryEntry, BillingProfile, UserAccount (T&C fields), ParticipantReadiness | F1.1, F1.2, F1.3, F1.5 | REQ-008, 009, 012, 050, 058, INT-447/448 |
| **LB-03 Trade intake** | Queries the market for settled trades, clearing results and markets per window; deduplicates; attributes buyer/seller through LB-02; checks completeness per market; monitors intake | Trade (copy, read-only semantics), MarketInfo, ClearingResult, IntakeWindow, IntakeAnomaly | F2.1–F2.4 | REQ-001, 029, 041 (completeness), 058 |
| **LB-04 Settlement engine** | Runs billing periods (scheduled or on demand). Computes pair amounts, netting, threshold and carry-forward, currency conversion, VAT and tariff components; **builds the monthly statement (Level 1)**. Keeps the immutable billing ledger | BillingRun, PairSettlement, CarryForwardBalance, LedgerEntry, Statement, BillingAccount | F3.1–F3.4, F4.5 | REQ-002, 003, 005, 006, 007, 043, 055, 056, 059 |
| **LB-05 Invoicing** | Turns pair settlements into invoices in the producer's name. Assigns the legal number per producer, generates the **in-house PDF** and manages the invoice lifecycle (including manual status change with reason) | Invoice, InvoiceLine, InvoiceNumberSeries, InvoiceDocument, InvoiceStatusHistory | F4.1, F4.2, F4.4 | REQ-039, 042, 044, 045 (check), 054 |
| **LB-06 Payment orchestration** | **Accounts + KYC for every participant**; direct charges on the producer's account; **payouts (withdrawal, `autoPayout`, BR-14)**; processes provider events and classifies failures | PaymentAccount (provider refs, KYC status), PaymentIntent, Payment, Payout, ProviderEvent, FailureRecord | F5.1–F5.3, F5.5 | REQ-014, 015, 016, 017, 040, 045, 046, 051 |
| **LB-07 Reconciliation** | **Control**: checks that every invoice has its payment(s) and that every market has all its trades (vs ClearingResult). Flags discrepancies and incomplete settlements as alerts to the operator. Read-only on other blocks' data | ReconciliationResult, Discrepancy | F5.4, F2.3 (control part) | REQ-041 |
| **LB-14 Reporting & exports** | **Consultation**: community-manager views (payment status, member history for disputes), periodic summary, **payout overview (REQ-060)**, KPI export and KPI logs, end-to-end trace payment → invoice → run → trades. Read-only on other blocks' data | ReportSnapshot, KpiExport (derived, rebuildable) | F6.2–F6.4, F6.5 | REQ-018, 028, 031, 032, 046, 047, 060 |
| **LB-13 Scheduling** | Triggers **time-based** jobs at the right moment, per community calendar, by sending a command to the owning block. It has no business logic and gives one supervision point for every deadline (see §4.5) | JobDefinition, JobExecution | — (cross-cutting) | REQ-006, 011, 029, 053, 056 |
| **LB-08 Publication** | Publishes `billingStatement`, `billingInvoice`, `billingPayment`, `billingPayout`, `billingKycStatus`; **receives commands on P-CMD** and forwards them to LB-12 commands. Publishes through the data-space port with retry, and purges cached messages | OutboundMessage (outbox), PublicationStatus | F6.1, F7.2 (purge) | REQ-048, 052, 053 |
| **LB-09 Notification** | Sends invoice e-mails (PDF attached), payment confirmations, **payment reminders (REQ-061)** and failure notices. Member IdP invitations are owned by R2M (INT-463), not this block | NotificationLog | P1, F4.2, F5.3, F6.5 | REQ-017, 039, 061 |
| **LB-10 Compliance** | Access/change audit log. Retention rules and purge. Data-subject request workflow: export or erase personal data and propagate the request to LB-02, LB-05, LB-06 (provider) and LB-01 (IdP: delegated to the project UI, INT-463), keeping invoices under legal retention | AuditEvent, RetentionPolicy, DataSubjectRequest | F7.1–F7.3 | REQ-011, 013, 030 |
| **LB-11 Reference data** | Exchange rates (EUR→community currency, by date) and VAT rates per community | ExchangeRate | F3.4 | REQ-002, 007 |
| **LB-12 Billing API** | Documented entry point for the **reference client**: profiles, balances, invoices, **withdrawal, statements**, payment, onboarding, terms, admin, reports. Dispatches EWDS commands from P-CMD | None (facade) | all user-facing functions (reference path) | REQ-052 |

## 3. External ports

Each port is a logical interface. Implementations are **env-selected**; EWDS adapters are real with **mock as the default** until EWAG grants land (A8).

| Port | Direction | Purpose | Real implementation (target) | **V1 implementation** |
|---|---|---|---|---|
| **P-MKT Market** | out → in | Get settled trades per time window (≤ 24 h), clearing results per market, markets (delivery period, community, mechanism) | GSY DEX via EWDS request/reply (`tradesQuery`, `clearingResultsQuery`, `marketsQuery`); GSY off-chain storage REST is a **test fixture only** (A8) | **EWDS Client Gateway adapter** selected by `MARKET_ADAPTER` (mock default until EWAG grants roles) |
| **P-DS Data space** | out | Publish five billing record types; purge cached messages | EWDS Client Gateway (Blooo instance) | **EWDS CG adapter** (mock default) |
| **P-CMD Command channel** | in | Billing command request/reply on EWDS (project UI path) | `billingCommandRequest` / `billingCommandReply` | **EWDS CG adapter** (mock default) |
| **P-TARIFF Tariff** | out | DSO tariff records (grid fee, levy, tax); none published yet → 0 + mention | EWDS tariff topic when available | **Mock** (0 + mention) |
| **P-PSP Payment provider** | out + in (events) | Connect accounts + KYC for every participant; PaymentIntents (direct charge); payouts; webhooks incl. `payout.*` | Stripe test or live per community | **Stripe** test or live per community |
| **P-IDP Identity provider** | out + in | Service JWT validation (`module-service` client credentials) and ops UI SSO. Member account creation, invitation and erasure are owned by R2M (INT-463), not by this port | Project IdP (Keycloak hosted by Blooo, replaceable by a pilot OIDC IdP) | Local development instance |
| **P-FX Rates** | out | EUR→CHF reference rate for a date | ECB reference rates | **Mock**: fixture table |
| **P-MAIL Mail** | out | Send e-mails with attachments | Transactional mail service | Local mail catcher |
| **P-KPI KPI export** | out | Deliver periodic billing exports for WP6 / GSY Analytics | Format/channel to agree (file or EWDS) | File export |
| **Client API** | in | **Reference client only** (`apps/web`); project UI uses EWDS records + P-CMD | — | Real (Blooo reference client) |

## 4. Internal interactions

### 4.1 Domain events

| Event | Emitted by | Consumed by | Meaning |
|---|---|---|---|
| ParticipantOnboarded | LB-02 | LB-06 (create provider customer/account link) | Actor ingested from EWDS (R2M); IdP account is managed by R2M (INT-463) |
| UserAccountStatusChanged | LB-02 | LB-08 (`billingKycStatus`) | UserAccount snapshot (kycVerified + T&C) after terms accept or KYC apply (INT-448) |
| ParticipantReadinessChanged | LB-02 (from LB-06 KYC status) | LB-05, LB-12 | Participant is or is no longer **KYC-verified** (terms + KYC for every role) |
| ParticipantOffboarded | LB-02 | LB-04 (force final settlement) | Participant left the community |
| KycStatusChanged | LB-06 | LB-02, LB-08 (billingKycStatus), LB-14 | KYC / payout capability change for a participant or manager |
| TradesIngested | LB-03 | LB-04 | New attributed trades available for a window |
| IntakeAnomalyDetected | LB-03 | LB-07, LB-14, operator alert | Incomplete market, unknown party, intake stopped |
| BillingRunCompleted | LB-04 | LB-05, LB-08 | Pair settlements of a run ready to invoice; statement built |
| StatementIssued | LB-04 | LB-08, LB-09 | Monthly participant statement issued or updated |
| PayoutStatusChanged | LB-06 | LB-08, LB-09, LB-14 | Payout requested / pending / paid / failed / cancelled |
| KycStatusChanged | LB-06 | LB-02, LB-08 | Connect or Identity verification status change |
| InvoiceIssued / InvoiceStatusChanged | LB-05 | LB-08, LB-09, LB-07, LB-14 | New invoice; any status change (incl. manual) |
| PaymentStatusChanged | LB-06 | LB-05 (outstanding amount, status), LB-08, LB-09, LB-07, LB-14 | pending / succeeded / failed / cancelled / refunded |
| ErasureRequested | LB-10 | LB-02, LB-05, LB-06, LB-01 | Data-subject erasure to execute |

### 4.2 Key commands (synchronous)

| Command | From → To | Purpose |
|---|---|---|
| ResolveParty(marketId) | LB-03 → LB-02 | Market identifier → participant, community |
| GetCommunitySettings(communityId) | LB-04 → LB-02 | Currency, period, threshold, VAT, mode |
| GetRate(currency, date) | LB-04 → LB-11 | Exchange rate |
| GetUnbilledTrades(pair, until) | LB-04 → LB-03 | Trades for a settlement run |
| CheckReadiness(participantId) | LB-05 → LB-02 | Terms + KYC OK (every role) before issuing |
| RequestWithdrawal(participantId, period) | LB-12 / P-CMD → LB-06 | Withdrawal from connected account (BR-14) |
| StartPayment / StartKyc / SendReminder / TriggerBillingRun | LB-12 / P-CMD → owning blocks | EWDS command channel (A7); map to contract command names |
| PayInvoice(invoiceId) | LB-12 → LB-06 | Start payment of an invoice |
| ChangeInvoiceStatus(invoiceId, status, reason) | LB-12 → LB-05 | Manual status change by the community manager |

### 4.3 Periodic billing run (P2) at block level

```mermaid
sequenceDiagram
  participant SCH as LB-13 Scheduling / manager
  participant SET as LB-04 Settlement
  participant TIN as LB-03 Trade intake
  participant MKT as P-MKT Market
  participant PCM as LB-02 Participants
  participant REF as LB-11 Reference data
  participant INV as LB-05 Invoicing
  participant PUB as LB-08 Publication
  participant NOT as LB-09 Notification
  SCH->>SET: StartRun(community, period)
  SET->>TIN: Ensure intake complete for period
  TIN->>MKT: tradesQuery per window, clearingResultsQuery, marketsQuery
  MKT-->>TIN: trades, clearing results, markets
  TIN->>PCM: ResolveParty(buyer, seller)
  TIN-->>SET: TradesIngested (+ anomalies)
  SET->>PCM: GetCommunitySettings
  SET->>REF: GetRate(currency, period end)
  SET->>SET: pair amounts, netting, threshold, VAT, tariff, ledger, statements
  SET-->>PUB: StatementIssued
  SET-->>INV: BillingRunCompleted(pair settlements)
  INV->>PCM: CheckReadiness(producer)
  INV->>INV: number, PDF, status Open
  INV-->>PUB: InvoiceIssued
  INV-->>NOT: InvoiceIssued
  PUB->>PUB: map to billingInvoice, publish via P-DS
  NOT->>NOT: e-mail PDF to consumer and producer
```

### 4.4 Payment (P4) at block level

```mermaid
sequenceDiagram
  participant API as LB-12 Billing API
  participant PAY as LB-06 Payment
  participant PSP as P-PSP (Stripe test/live)
  participant INV as LB-05 Invoicing
  participant PUB as LB-08 Publication
  participant NOT as LB-09 Notification
  API->>PAY: PayInvoice(invoiceId)
  PAY->>PSP: create payment to producer account
  PSP-->>PAY: provider event (succeeded / failed)
  PAY->>PAY: dedupe event, record payment / failure category
  PAY-->>INV: PaymentStatusChanged
  INV->>INV: outstanding amount, status Paid / Open / Overdue
  PAY-->>PUB: PaymentStatusChanged
  INV-->>PUB: InvoiceStatusChanged
  PAY-->>NOT: confirmation or failure notice
```

### 4.6 Payout (withdrawal, BR-14)

```mermaid
sequenceDiagram
  participant API as LB-12 / P-CMD
  participant PAY as LB-06 Payment
  participant INV as LB-05 Invoicing
  participant PSP as P-PSP (Stripe test/live)
  participant PUB as LB-08 Publication
  API->>PAY: RequestWithdrawal(participantId, period)
  PAY->>INV: List producer invoices for period
  PAY->>PAY: BR-14: all Paid
  PAY->>PSP: create payout
  PSP-->>PAY: payout.* webhook
  PAY-->>PUB: PayoutStatusChanged → billingPayout
```

### 4.5 Time-based jobs (LB-13 Scheduling)

LB-13 only decides **when** a job runs. Each job then sends a command to the block that owns the work; the business logic stays in that block.

| Job | Default schedule | Target block | Command | Requirement |
|---|---|---|---|---|
| Re-query recent trade windows | Hourly, plus before each run | LB-03 | RefreshIntake(window) | REQ-001 |
| Intake watchdog | Every 15 min | LB-03 | CheckIntakeHealth | REQ-029 |
| Close billing period | Per community calendar (monthly by default) | LB-04 | StartRun(community, period) | REQ-006 |
| Forced final invoices | 31 Dec, and on offboarding (event-driven) | LB-04 | StartRun(type = final) | REQ-056 |
| Auto payout | Per community when `autoPayout` | LB-06 | RequestWithdrawal(participant, period) | REQ-015 |
| Payment reminders / missing-payment alert | Per schedule | LB-09 | SendReminder(invoiceId) | REQ-061 |
| Overdue detection | Daily | LB-05 | MarkOverdue(asOf) | REQ-044 |
| Reconciliation | Daily, plus after each run | LB-07 | Reconcile(scope) | REQ-041 |
| Periodic summary and KPI export | After each period close | LB-14 | BuildReport / ExportKpi | REQ-032, REQ-047 |
| Publication retry | Every 5 min | LB-08 | RetryPending | REQ-048 |
| Gateway cache purge | Daily (≤ 7 days) | LB-08 | PurgeCache | REQ-053 |
| Personal-data retention | Daily | LB-10 | ApplyRetention | REQ-011 |
| Exchange-rate refresh | Business days | LB-11 | FetchRates(date) | REQ-002 |

Every job execution is recorded (JobExecution) and visible to the operator. A failed job is retried and raises an alert.

## 5. Lifecycles

### Invoice

```mermaid
%% elk %%
stateDiagram-v2
  [*] --> Draft: settlement ready
  Draft --> Open: issued (number, PDF)
  Open --> PartiallyPaid: partial payment
  Open --> Paid: full payment
  PartiallyPaid --> Paid: remaining paid
  Open --> Overdue: due date passed
  Overdue --> Paid: paid late
  Open --> Disputed: manager flags dispute
  Disputed --> Open: dispute resolved
  Open --> Void: cancelled with reason (credit note)
  Paid --> [*]
  Void --> [*]
```

### Payment

```mermaid
%% elk %%
stateDiagram-v2
  [*] --> pending: payment started
  pending --> succeeded
  pending --> failed
  pending --> cancelled
  succeeded --> refunded
  failed --> [*]
  cancelled --> [*]
  succeeded --> [*]
  refunded --> [*]
```

### Participant readiness (gates invoicing and payment — KYC for all roles)

```mermaid
%% elk %%
stateDiagram-v2
  [*] --> Invited: EWDS Actor published by project UI (R2M)
  Invited --> ProfileCompleted: Actor profile complete (R2M)
  ProfileCompleted --> TermsAccepted: acceptTerms command (UserAccount T&C)
  TermsAccepted --> Ready: KYC verified (Connect for every role; Identity for managers) and payment method when buying
  Ready --> Restricted: KYC revoked or payment method removed
  Restricted --> Ready: resolved
  Ready --> Offboarded: left community (final settlement)
  Offboarded --> [*]
```

Retention (LB-10, REQ-011): personal cache anonymized after `personalRetentionDays` (default 365); invoice identifiers kept for `invoiceRetentionYears` (6–10, default 10); KYC audit log kept for `kycLogRetentionYears` (at least 5, default 5).

### Billing run
`Scheduled → Collecting (intake) → Computing → Completed`, or `→ Failed` (retryable). A rerun for the same community and period creates a new **version**, and earlier versions are kept (LP-5). Type: `periodic` or `final` only.

### Statement

`Draft → Issued → Closed`

### Payout

`requested → pending → paid / failed / canceled`

## 6. Logical data model

Each entity is owned by one block (LP-1). Pseudonymous identifiers cross block boundaries; personal attributes do not.

| Entity | Owner | Key attributes | Personal data |
|---|---|---|---|
| Community | LB-02 | communityId, currency, billingPeriod, threshold, vatRate, billingMode, `autoPayout`, `payoutSchedule`, `liveEnabled`, oidcIssuer | No |
| Participant | LB-02 | participantId (Actor UUID), communityId, role (consumer/producer/prosumer), status | No |
| RegistryEntry | LB-02 | participantId, marketActorId, meterId, validFrom/To | Pseudonymous |
| BillingProfile | LB-02 | participantId, name, address, e-mail — **cache of Actor**; project path updates via `actor` republish only | **Yes** |
| UserAccount (T&C + KYC mirror) | LB-02 | participantId, termsVersion, selfBillingMandate, termsAcceptedAt, kycVerified | Link / status only; wire = `billingKycStatus` |
| PaymentAccount | LB-06 | participantId, providerAccountRef / customerRef, kycStatus, paymentMethodPresent — **every participant** | Provider refs |
| Trade | LB-03 | tradeId, marketId, buyerActorId, sellerActorId, kWh, price, status, deliveryStart/End, attributed participants, invoicedBy (invoiceId) | Pseudonymous |
| ClearingResult / MarketInfo | LB-03 | marketId, tradedQuantity, numTrades, delivery window, mechanism | No |
| BillingRun | LB-04 | runId, communityId, period, version, type (periodic/final), status | No |
| Statement | LB-04 | statementId, participantId, period, totals, invoiceIds, status | No (ids) |
| PairSettlement | LB-04 | runId, consumerId, producerId, tradeIds, kWh, energyAmount, vat, currency, rate, carriedForwardIn/Out | No |
| CarryForwardBalance | LB-04 | consumerId, producerId, amount, since | No |
| Invoice | LB-05 | invoiceId, legalNumber, producerId (issuer), consumerId, period, amounts, currency, status, dueDate, pairSettlementRef | No (ids) |
| InvoiceDocument | LB-05 | invoiceId, **PDF stored in LB-05 database** (names, addresses) | **Yes** |
| Payment | LB-06 | paymentId, invoiceId, amount, method, status, failureCategory, providerPaymentRef | Provider refs |
| Payout | LB-06 | payoutId, participantId, period, amount, status, providerPayoutRef | Provider refs |
| TariffComponent | LB-11 / LB-04 | communityId, gridFee, levy, tax, effectiveAt | No |
| OutboundMessage | LB-08 | messageId, topic, payload, status, publishedAt, purgeAt | No |
| AuditEvent | LB-10 | actor, action, target, timestamp | Yes (actor) |
| DataSubjectRequest | LB-10 | requestId, participantId, type, status, propagation results | Link only |
| ExchangeRate | LB-11 | currencyPair, date, rate, source | No |
| ReconciliationResult / Discrepancy | LB-07 | scope (invoice or market), expected, actual, status | No |
| JobDefinition / JobExecution | LB-13 | job, target block, schedule (per community), last run, outcome | No |

The mapping to ontology classes is in the functional view §5 and the dedicated [ontology datamodel](06-datamodel-ontology.md). Outbound messages follow `ewds-topics/` (five record types + command channel). Scenario sequences: [07-scenario-flows.md](07-scenario-flows.md).

## 7. Cross-cutting logical rules

| Concern | Rule |
|---|---|
| Consistency | Each block updates its own data atomically and emits events through an outbox. Consumers are idempotent. Trades and pair settlements are reserved by a run, so a trade can never be invoiced twice. |
| Ordering and late data | A trade that arrives after its period was billed goes to the next run. Recent intake windows are re-queried before each run (A13). |
| Corrections | A new run version for a still-uninvoiced period. For an issued invoice: Void plus a new invoice (or credit note). Never an update in place. |
| Failure handling | Port calls retry with backoff, and permanent failures become anomalies visible to the operator (NFR-006). Provider events are deduplicated by event id. |
| Security zones | Zone A (personal data): LB-02 profiles, LB-05 documents, LB-10 audit. Zone B (financial, pseudonymous): LB-03, LB-04, LB-05 invoices, LB-06, LB-07, LB-14. Zone C (outbound): LB-08, with no personal data by construction. Access is checked by LB-01 on every API call. |
| Auditability | Every write in zones A and B creates an AuditEvent (REQ-030). Every payment can be traced to its invoice, pair settlement, run and trades (REQ-028). |
| Mode live/virtual | **Live per community** (operator role + live keys); others virtual. Propagated to runs, invoices, payments, payouts and messages. P-PSP points to Stripe test or live accordingly. |

## 8. Traceability: functional → logical

| Function | Block(s) |
|---|---|
| F1.1–F1.3, F1.5 | LB-02 (+ LB-06 payment onboarding; IdP invite = R2M, INT-463) |
| F1.4 | LB-01 |
| F2.1–F2.4 | LB-03 |
| F3.1–F3.4 | LB-04 (+ LB-11) |
| F4.1, F4.2, F4.4 | LB-05 (+ LB-09) |
| F4.3 | *(withdrawn REQ-057)* |
| F4.5 | LB-04 (+ LB-08) |
| F5.5, F6.5 | LB-06 (+ LB-14, LB-09) |
| F5.1–F5.3 | LB-06 |
| F5.4 (and F2.3 control) | LB-07 |
| F6.1 | LB-08 |
| F6.2–F6.4 | LB-14 |
| Time-based triggers (all domains) | LB-13 |
| F7.1–F7.3 | LB-10 (+ LB-08 purge) |
| REQ-052 (APIs) | LB-12 |

## 9. Points for the application view
- Packaging: one modular application (blocks as modules) or several services. A modular monolith fits the V1 scope and team size; this is to be decided in view 3.
- Reference screens: which screens are in V1, built on LB-12 (**reference client only**).
- API style and versioning for LB-12, and the event transport between blocks.

## 10. Validation checklist
- [ ] The 14 logical blocks and their responsibilities are right (no missing or overlapping block)
- [ ] Data ownership per block is acceptable (LP-1, §6)
- [ ] External ports and V1 implementations are correct (EWDS adapters real mock-default; Stripe per community)
- [ ] Events and commands are sufficient for processes P1–P5
- [ ] Lifecycles (invoice, payment, readiness, run) are correct
- [ ] Cross-cutting rules (consistency, corrections, security zones) are acceptable

## 11. Decisions taken during validation (2026-10-07)
- Personal data limited to participant profiles (LB-02), invoice PDFs (LB-05) and the audit log (LB-10): **confirmed**.
- Correction of an issued invoice = Void + new invoice or credit note, never an update in place: **confirmed**.
- LB-07 "Reconciliation & reporting" **split** into LB-07 Reconciliation (control) and LB-14 Reporting & exports (consultation).
- New block **LB-13 Scheduling** for every time-based trigger (§4.5).
