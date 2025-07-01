# Requirements — Billing & Payment Service (T5.6 / D5.5)

Status: draft v5 (2026-10-07): v5 = working assumptions A13–A31 applied (producer-as-bank billing model, fees off-platform, virtual V1 with Stripe test mode); v4.2 = alignment with the GSY DEX v2 code and EWDS docs (REQ-001, 003, 004, 041, 042, 048, 053, NFR-017); v4 = identity model (project OIDC IdP), Stripe-only fiat methods, full Apache-2.0 publication and D5.5 scope clarifications; v4.1 = EWDS Client Gateway integration (REQ-001, REQ-029, REQ-053, NFR-004, NFR-017, assumption A12). Previous version: v3 (2026-09-24). Every requirement below traces back to one or more user stories in `user-stories.md`, and forward to at least one UAT test case in `uat-test-cases.md`. IDs are stable once assigned — do not renumber; deprecate instead.

**Out of D5.5 scope (v5):** grid fees, taxes and levies of suppliers/DSOs (A20), imbalance penalties (A18), community bonus and incentives (A30), crypto, AMM and stablecoin (D5.10). **V1 integration:** only Stripe (test mode) is integrated; the other external systems are mocked (A32).

Priority: **M**ust / **S**hould / **C**ould / **W** = Won't-this-phase (MoSCoW), inherited from the source user story unless noted otherwise. Requirements marked **W** are out of scope for D5.5 and kept for traceability (previous priority in brackets). The item notes carry a `target_release` property: **D5.5** (V1, M24) or **D5.10** (V2, M30).

# Functional requirements

## Billing calculation

| ID | Requirement | Priority | Source (user stories) |
|---|---|---|---|
| REQ-001 | The system shall obtain the trades of a billing period from GSY DEX over the EWDS, through its Client Gateway, by sending tradesQuery requests (time windows of at most 24 h, recent windows re-queried to catch late trades) and clearingResultsQuery / marketsQuery requests on the GSY request channel (topic owner integration.apps.intelligent.auth.ewc, version 1.0.0), and reading the matching responses. Only trades with status settled are billed; ingestion is idempotent on tradeId; the delivery period of a trade is taken from its Market (deliveryStartTime/deliveryEndTime), not from the trade timestamp. The GSY off-chain storage REST API may be used for backfill or reconciliation where network access is granted. | M | US-001, US-005 |
| REQ-002 | The system shall compute, for each billing period, the amount owed between each consumer and each producer from the settled trades between them. Trade prices are taken as EUR; for communities whose currency is not EUR (e.g. CHF), amounts are converted at the ECB reference rate of the last business day of the period (or of the settlement date for an early settlement), and each invoice is issued in a single currency, the community currency, showing the rate and its date. | M | US-001, US-002 |
| REQ-003 | The system shall use the trade price provided by GSY DEX (tradePrice, which already includes any bilateral preference rate agreed between trading partners) as the final energy price of each trade, and shall not recompute or adjust it. | S | US-003 |
| REQ-004 | The system shall include the grid-related fee, tax and levy components provided by the pilot/DSO tariff data in the billing calculation; when a pilot provides no grid-fee data, the bill shall state it rather than infer a value. *(Deprecated in v5.)* | W (was S) | US-004 |
| REQ-005 | The system shall persist every billing calculation as an immutable, versioned ledger entry; a balance is never overwritten in place. | M | US-005 |
| REQ-006 | The system shall allow a community manager to trigger or schedule a billing run per pilot/community, with a configurable billing period (monthly by default, up to quarterly). | M | US-006 |
| REQ-007 | The system shall expose to both parties of each invoice the list of the trades it covers (delivery period, kWh, price per kWh, amount), the energy amount, the VAT (rate configurable per community, 0 by default) and the total. Grid fees, taxes and levies of the supplier or DSO are not part of P2P invoices; on published records the grid-fee amount is 0. | M | US-002 |
| REQ-039 | The system shall generate for each invoice a PDF issued by the platform in the name of the producer (self-billing) and addressed to the consumer, showing the trades covered and the amounts, make it available to both parties and send it to them by e-mail when it is issued. | M | US-037 |
| REQ-042 | The system shall assign each invoice a unique, sequential and immutable legal invoice number at issue time, in a numbering series per producer (issuer), shown on the PDF and kept in the billing service; the number is not published on the EWDS, where invoiceId remains the shared identifier. | M | US-037 |
| REQ-043 | The system shall support a per-community billing mode, live or virtual; in virtual mode, invoices are computed and issued and payments run only in the payment provider's test environment (no real money). In D5.5 V1 all communities run in virtual mode. | M | US-040 |
| REQ-044 | The system shall manage invoice statuses (Draft, Open, PartiallyPaid, Paid, Overdue, Void, Disputed) and allow an authorised community manager to change a status manually, with a mandatory reason and an audit trail. | S | US-041 |
| REQ-054 | The system shall issue, for each billing period, one invoice per consumer→producer pair covering all settled, not yet invoiced trades between them, issued by the platform in the name of the producer (self-billing) and paid through one payment. | M | US-045, US-046 |
| REQ-055 | The system shall net, within a billing period, the purchases and sales between the same two participants, and issue a single invoice in the direction of the net amount. | M | US-045 |
| REQ-056 | The system shall not invoice a pair whose net amount for the period is below a minimum threshold configurable per community (default 5 EUR / 5 CHF); the amount is carried forward to the next period, and an invoice is forced at the end of the calendar year or when a participant leaves the community. | S | US-045 |

## Administrative management (GDPR)

| ID | Requirement | Priority | Source (user stories) |
|---|---|---|---|
| REQ-008 | The system shall let a community manager onboard participants by importing a minimal list (e-mail, GSY DEX actor identifier, meter identifier, role consumer/producer); the import creates the participant record, the account in the identity provider and sends an invitation, after which the participant completes their billing profile (name, address) in the portal. | M | US-007 |
| REQ-009 | The system shall allow a participant to view and update their own billing profile (name, address, contact e-mail); identifiers used for trade attribution (GSY DEX actor identifier, meter, community) can only be changed by the community manager. | M | US-008 |
| REQ-010 | The system shall enforce access control so a participant can read only their own personal data. | M | US-009 |
| REQ-011 | The system shall define and enforce a retention period for personal data, after which it is deleted or anonymized. | M | US-010 |
| REQ-012 | The system shall support offboarding a participant from active billing while retaining historical ledger/audit records. | S | US-011 |
| REQ-013 | The system shall support exporting or confirming deletion of a participant's personal data upon a valid GDPR data-subject request received through the portal or the community manager, and shall propagate erasure to the payment provider and the identity provider using the stored external identifiers; invoices and accounting records are kept for the legal retention period. | S | US-012 |
| REQ-050 | The system shall require each participant and community manager to accept the current version of the INTELLIGENT Terms & Conditions of Use before billing is activated for them, including, for producers, the mandate allowing the platform to issue invoices in their name (self-billing), and record the accepted version and timestamp. | M | US-044 |
| REQ-053 | The system shall purge message payloads cached by its EWDS Client Gateway once they have been ingested, using the gateway's message clean-up job, and in any case no later than 7 days after reception. | M | US-010 |
| REQ-058 | The system shall maintain a participant registry linking each participant's identifier (Actor UUID) to their GSY DEX actor identifier, community and meter, maintained by the community manager, and use it to attribute every ingested trade to a buyer and a seller; trades whose parties are unknown are flagged and not invoiced. | M | US-007 |

## Fiat payments (Stripe)

| ID | Requirement | Priority | Source (user stories) |
|---|---|---|---|
| REQ-014 | The system shall let a consumer pay each invoice through Stripe (card or SEPA Direct Debit), the payment being made directly to the producer's Stripe Connect account so that the platform never holds the funds; Twint and PayPal are out of scope. | M | US-013, US-046 |
| REQ-015 | The system shall ensure that amounts paid to a producer are credited to the producer's Stripe Connect account and paid out to their bank account by Stripe; no separate payout initiated by the platform is required. | M | US-014, US-046 |
| REQ-016 | The system shall detect and flag failed Stripe charges/payouts with a failure reason, via webhook rather than polling. | M | US-015 |
| REQ-017 | The system shall notify a participant of the success or failure of a fiat payment. | S | US-016 |
| REQ-018 | The system shall provide an aggregated view of fiat payment status across all participants for a given billing period. | S | US-017 |
| REQ-040 | The system shall integrate the payment-provider onboarding required for fiat payments and payouts into the platform flow, minimising additional steps for community members. | M | US-039 |
| REQ-045 | The system shall not issue invoices in the name of a producer, nor accept payments to them, until the producer has completed the payment provider's onboarding and KYC; a consumer must have a valid payment method registered before paying. | M | US-039 |
| REQ-051 | The system shall onboard each producer on the payment provider (Stripe Connect account with Stripe Identity verification and bank account) and register each consumer as a Stripe customer with a payment method; the resulting verification status is used by REQ-045. | M | US-039 |
| REQ-052 | The system shall expose documented APIs for billing profiles, balances, invoices, early settlement, payment, KYC onboarding, Terms & Conditions and community-manager administration; Blooo also provides reference screens built on these APIs as an accelerator, which the project UI (R2M) can replace by connecting its own screens to the same APIs. | S | US-013, US-014, US-037 |
| REQ-057 | The system shall let a consumer settle early, at any time, the not yet invoiced trades with a given producer: an invoice is issued immediately for these trades and paid, and the next periodic invoice only covers the remaining trades. | S | US-047 |

## Crypto payments — *deferred to D5.10*

| ID | Requirement | Priority | Source (user stories) |
|---|---|---|---|
| REQ-019 | The system shall support connecting a self-custody wallet (MetaMask, WalletConnect, Ledger) for settlement. | W (was M) | US-018 |
| REQ-020 | The system shall support a custodial/embedded wallet option (e.g. via DFNS) for participants without a self-custody wallet. | W (was S) | US-019 |
| REQ-021 | The system shall provide transaction confirmation details (hash, confirmation count) for crypto settlements. | W (was M) | US-020 |
| REQ-022 | The system shall flag a crypto transaction that fails or stalls, showing its last known on-chain status. | W (was M) | US-021 |

## AMM interface (T5.4) — *deprecated for D5.5, to be reassessed for D5.10*

Billing uses the cleared off-chain trades published on the EWDS, whatever the trading mechanism (GSY DEX or AMM) — see assumption A10.

| ID | Requirement | Priority | Source (user stories) |
|---|---|---|---|
| REQ-023 | The system shall support token swaps (energy token ⇄ i-Euro) via the AMM interface. | W (was S) | US-022 |
| REQ-024 | The system shall verify a buyer holds sufficient collateral before executing an AMM swap on their behalf. | W (was M) | US-023 |
| REQ-025 | The system shall display the AMM's quoted price to a participant before they confirm a swap. | W (was C) | US-024 |

## Stablecoin (i-Euro) — *deferred to D5.10*

| ID | Requirement | Priority | Source (user stories) |
|---|---|---|---|
| REQ-026 | The system shall support converting a participant's balance into the i-Euro stablecoin. | W (was S) | US-025 |
| REQ-027 | The system shall record i-Euro balance movements in the same auditable ledger as other payment rails. | W (was S) | US-026 |

## Traceability & operations

| ID | Requirement | Priority | Source (user stories) |
|---|---|---|---|
| REQ-028 | The system shall allow tracing any payment record back to its originating trade(s) and balance calculation. | M | US-027 |
| REQ-029 | The system shall alert operators if expected data from GSY DEX or EWDS stops arriving within a defined threshold, if the Client Gateway loses its connection to the EWDS Message Broker, or if its mTLS certificate approaches expiry. | M | US-028 |
| REQ-030 | The system shall log all access to and modification of participant payment/personal data, including actor and timestamp. | M | US-029 |
| REQ-041 | The system shall reconcile calculated balances with the corresponding payment and payout results and flag discrepancies or incomplete settlements; it shall also check, per market, that the sum and number of ingested trades match the ClearingResult (tradedQuantity, numTrades) and flag any gap. | M | US-038 |
| REQ-046 | The system shall log every failed transaction with its cause and suggested corrective action (KPI UE-3), and the processing time of each payment per payment method (KPI TE-2). | M | US-042 |
| REQ-047 | The system shall export, per participant and per period, the amounts invoiced and paid, the kWh and the components (energy, VAT) for the KPI calculations of WP6 and GSY DEX Analytics (EC-1, EC-2); the system does not compute EC-1/EC-2 nor compare with a baseline bill. | S | US-042 |
| REQ-048 | The system shall publish on the EWDS, through its Client Gateway, each issued Invoice (issuer producer, recipient consumer, tradeIds, paymentIds) and each Payment status change, on two topics created by EWAG from JSON schemas (2020-12) proposed by Blooo: billingInvoice and billingPayment, version 1.0.0, owner integration.apps.intelligent.auth.ewc, based on the INTELLIGENT Invoice and Payment schemas and extended with billingMode (live/virtual). The payment status of trades is read from these records; the system shall not change trade statuses. Payloads contain no personal data (no StripePayment, no Actor details, no legal invoice number); the grid-fee amount is 0. | M | US-027 |

## Reporting & dispute resolution

| ID | Requirement | Priority | Source (user stories) |
|---|---|---|---|
| REQ-031 | The system shall allow a community manager to retrieve a participant's full billing/payment history. | M | US-030 |
| REQ-032 | The system shall generate a periodic summary report of billed, collected, paid-out, and failed amounts per community. | S | US-031 |

## Authentication & SSO

Users authenticate via OAuth2/OIDC against a **project Identity Provider** (e.g. Keycloak) **operated by Blooo** for the project. The IdP is an **external, replaceable component**: a pilot may later replace it with its own OIDC IdP through configuration only. The billing service is an OIDC relying party and never stores passwords. OIDC only in this phase (SAML 2.0 out of scope).

| ID | Requirement | Priority | Source (user stories) |
|---|---|---|---|
| REQ-033 | The system shall authenticate all users (community members, community managers, operators) exclusively via OAuth2/OIDC against the Identity Provider configured for their community — by default the project IdP operated by Blooo; the billing service shall never issue or store user passwords. | M | US-032, US-034 |
| REQ-034 | The system shall resolve, from configuration, the OIDC issuer to use for each community (the project IdP by default, or a pilot's own OIDC IdP where configured) and redirect the user to that issuer at login. | S (was M) | US-033 |
| REQ-035 | The system shall complete the OAuth2 Authorization Code flow (with PKCE) against the resolved IdP and establish an authenticated session on successful return. | M | US-032, US-033 |
| REQ-036 | The system shall store, per community, only the OIDC client configuration required to authenticate (issuer URL, client ID, reference to the client secret held in a secrets store) — never user passwords or IdP credentials. | M | US-034 |
| REQ-037 | The system shall allow an operator to switch a community from the project IdP to a pilot's own OIDC IdP (or back) through configuration, without a code deployment. | S | US-035 |
| REQ-038 | The system shall surface SSO login failures (e.g. IdP unreachable, consent denied) to the community manager for members of their own pilot. *(Deprecated in v4 — R-1: handled by the IdP.)* | W (was C) | US-036 |
| REQ-049 | The system shall derive each user's role (community member, community manager, operator) and community membership from the claims of the tokens issued by the IdP, and enforce authorisations accordingly. | M | US-043 |

# Non-functional requirements

| ID | Requirement | Priority | Source |
|---|---|---|---|
| NFR-001 | Personal and financial data must be protected in transit (TLS) and at rest (encryption). | M | US-009, US-029; GDPR |
| NFR-002 | Personal and financial data must be hosted in the EU or in a country covered by an EU adequacy decision (e.g. Switzerland), consistent with the project consent form, which excludes transfers to third countries. | M | D1.2 DMP (consent form); GDPR |
| NFR-003 | Every balance and payment record must be immutable/append-only and attributable to the process/run that created it. | M | US-005, US-027, US-030 |
| NFR-004 | Data structures must align with the INTELLIGENT ontology v1.0.0 and the published EWDS JSON schemas (schemas/v1.0.0/billing: Billing, Invoice, Payment, StripePayment) and with the classes Actor, Address, ContactDetails, UserAccount, EnergyTrade (incl. `tradeStatus`), Market, ClearingResult and Tariff. Billing replaces the former EnergyAccount class. | M | ARCHITECTURE.md §5; GA; EWAG eu-intelligent repository |
| NFR-005 | The codebase must be structured for open-source publication without exposing secrets or unresolved proprietary lock-in. | M | GA Open Science commitment |
| NFR-006 | Billing runs and payment processing must degrade gracefully (retry / clear failure state) if a downstream provider (Stripe, blockchain network, EWDS) is briefly unavailable. | S | US-015, US-021, US-028 |
| NFR-007 | A participant with no blockchain knowledge must be able to complete onboarding and payment using only the fiat rail. | M | US-013; P2 persona |
| NFR-008 | A standard billing run for a pilot's full membership must complete within an agreed time window (value to be confirmed with pilots). | S | US-006 |
| NFR-009 | The system must support the specific rails active at a given pilot without assuming every rail (fiat/crypto/AMM/stablecoin) is used everywhere. | M | All pilots |
| NFR-010 | Every requirement in this document must be verifiable by at least one UAT test case. | M | Methodology requirement (traceability) |
| NFR-011 | The OIDC integration must use the Authorization Code flow with PKCE and validate the ID token signature, issuer and audience, rejecting tokens from issuers not configured for the user's community. | M | Security best practice; US-032 |
| NFR-012 | The service must be published under the Apache-2.0 licence, with LICENSE and NOTICE files and no linked GPL code. The whole service is published; only secrets and production deployment configuration are excluded. | M | D1.2 DMP (licensing); GA Open Science commitment |
| NFR-013 | The identity provider must remain an external, replaceable component: the billing service relies only on standard OIDC (discovery, Authorization Code + PKCE, standard and documented custom claims) and uses no IdP-vendor-specific API, so that the project IdP can be replaced by a pilot OIDC IdP through configuration only. | M | US-035; identity workshop 02/10/2026 |
| NFR-014 | Payment-provider integration must sit behind a provider-agnostic abstraction layer, so that the PSP can be replaced (e.g. Stripe by Mangopay) without changing billing logic; a mock PSP adapter must be provided for CI and tests. | M | D5.5 scope and architecture |
| NFR-015 | Incoming payment-provider webhooks must have their signatures verified and be rejected otherwise; all APIs must be exposed over HTTPS (with mTLS for service-to-service calls where the EWDS Client Gateway requires it); logs must not contain personal data in clear. | M | Security best practice; GDPR |
| NFR-016 | Participant journeys (onboarding, KYC, payment, withdrawal) must minimise the number of steps and show only the information needed at each step; the target number of steps is to be validated with the pilots. | S | D2.3 stakeholder requirements (simplified UX) |
| NFR-017 | The billing service must operate its own EWDS Client Gateway, self-hosted in the EU or an adequacy country, in system/API mode, with its API protected by an API key (and its UI, if enabled, by user authentication), reachable only from the billing service's private network, its gateway private key and secrets held in a key vault, and its connection to the EWDS Message Broker secured by an EWF-issued mTLS certificate. | M | DDHub Client Gateway and Digital Spine documentation |

# Assumptions & dependencies

Working assumptions on which this specification relies. Each one must be confirmed by the partner indicated; a change may modify the requirements listed.

| # | Assumption / dependency | To confirm with | Status | Affects |
|---|---|---|---|---|
| A1 | Billing is computed monthly by default; some pilots may need longer periods (up to quarterly). | Pilot owners (WP6) | Partly confirmed | REQ-006 |
| A2 | The billing calculation is performed by the billing service, not by the EWDS (transport layer only). | GSY, EWAG | Confirmed | REQ-001, REQ-002 |
| A3 | Payment details of participants are held by the payment provider (Stripe Connect accounts), not by the billing service. | Blooo | Confirmed | REQ-015, REQ-051 |
| A4 | The administrative data needed for invoicing (name, address, contact) are provided by the pilot/community administrators. The initial assumption (data delivered through the EWDS) no longer holds. | Pilots, EWAG | Open | REQ-008, REQ-009, REQ-051 |
| A5 | Personal data, KYC results and invoices are stored in a dedicated, access-controlled store of the billing service. | Blooo, project DPO | Open | REQ-010, REQ-011, NFR-001 |
| A6 | GDPR erasure requests reach the billing service and are propagated to the payment provider and the identity provider; the origin of these requests is still to be defined. | EWAG, project DPO | Open | REQ-013 |
| A7 | A shared project integration environment (synthetic or anonymised data, end-to-end tests) is available. | R2M, EWAG, GSY | Open | UAT execution |
| A8 | Platform-level CI/CD pipelines (unit, contract and end-to-end tests) are available. | EWAG, R2M | Open | NFR-010, UAT execution |
| A9 | Real payments and legally binding invoices only at pilots allowing live billing; virtual billing elsewhere. | Pilot owners, R2M | Confirmed | REQ-043 |
| A10 | Billing uses the cleared off-chain trades published on the EWDS, whatever the trading mechanism (GSY DEX or AMM); no AMM integration in D5.5. | GSY, UoC | Confirmed | REQ-001, REQ-023...025 |
| A11 | Identity is provided by a project OIDC IdP operated by Blooo, replaceable by a pilot OIDC IdP. | Consortium (identity workshop 02/10/2026) | Confirmed | REQ-033..037, REQ-049, NFR-011, NFR-013 |
| A12 | The EWDS topic schemas for EnergyTrade, ClearingResult and Tariff (not yet published in the EWAG schema repository), with their topic owner and channel names, are published by EWAG/GSY, and the billing gateway is granted the role needed to subscribe to them. **Blocking dependency for REQ-001.** | EWAG, GSY | Open | REQ-001, REQ-004, REQ-029 |
| A13 | Trades are obtained through a trade-source interface with two adapters: EWDS request/reply on the GSY DEX request channel, and the GSY DEX off-chain storage REST API. The billing gateway is granted access to these channels. (WA-01) | GSY | Open | REQ-001 |
| A14 | Billing keeps a participant registry linking Actor UUID, GSY DEX actor identifier, community and meter. The community manager maintains it. (WA-02) | GSY, pilots | Open | REQ-008, REQ-058 |
| A15 | Billing reads no tariff in V1. If tariffs are ever needed, they come from the DSO / grid operator through the Grid Operator API and the EWDS. (WA-03) | EWAG, ERE | Open | REQ-004 |
| A16 | Trade prices are in EUR. CHF communities are converted at the ECB reference rate. Each invoice is issued in the community currency. (WA-04) | GSY, AEM, HSLU | Open | REQ-002 |
| A17 | Timestamps are accepted as epoch or RFC 3339. Values are already unscaled. Amounts use exact decimals, rounded per line. (WA-05) | GSY | Open | REQ-001, REQ-002 |
| A18 | Imbalance penalties are not invoiced in D5.5. (WA-06) | GSY | Open | — |
| A19 | Billing model: one invoice per consumer→producer pair and per period, issued in the producer's name (self-billing). Amounts are netted per pair. Amounts below a threshold are carried forward. Early settlement is possible. Payment goes directly to the producer's Stripe Connect account. (WA-07) | Pilots, R2M, legal review | Open | REQ-002, REQ-014, REQ-015, REQ-039, REQ-042, REQ-045, REQ-051, REQ-054..057 |
| A20 | Grid fees, taxes and levies stay on the existing supplier/DSO bill. P2P invoices carry only the energy traded plus VAT. (WA-08) | EWAG, ERE, pilots | Open | REQ-004, REQ-007 |
| A21 | The community manager imports a minimal participant list, which creates the identity-provider accounts and sends invitations. Participants complete their profile and do KYC through the payment provider. (WA-09) | Pilots, EWAG | Open | REQ-008, REQ-009, REQ-051 |
| A22 | In D5.5 V1, all communities run in virtual mode, with the payment provider in test mode. (WA-10) | WP6 (HSLU), R2M | Open | REQ-043 |
| A23 | Comparison with a baseline bill and the EC-1/EC-2 computation are done by WP6 / GSY Analytics from the billing export. (WA-11) | HSLU, GSY | Open | REQ-043, REQ-047 |
| A24 | GDPR requests reach billing through the portal or the community manager. They are not routed through the EWDS. (WA-12) | EWAG, project DPO | Open | REQ-013 |
| A25 | Each community operator is the data controller. The billing provider acts as its processor. Producers give a self-billing mandate in the Terms & Conditions. (WA-13) | R2M, project DPO | Open | REQ-050, NFR-002 |
| A26 | Client Gateway cache is retained for 7 days at most. (WA-14) | Project DPO, EWAG | Open | REQ-053 |
| A27 | The billing service exposes APIs. The project UI may replace the reference screens. (WA-15) | R2M | Open | REQ-052 |
| A28 | The billing topics billingInvoice and billingPayment are created by EWAG from schemas proposed by Blooo. (WA-16) | EWAG | Open | REQ-048 |
| A29 | The EWDS schemas are Apache-2.0. The billing service exchanges only messages and REST calls with GSY DEX, so it is a separate work. (WA-17) | EWAG, GSY | Open | NFR-012 |
| A30 | Community bonus and incentives are out of D5.5. (WA-18) | R2M, AEM | Open | — |
| A31 | D5.5 is due at M24 = 30/11/2026. Hosting is in the EU. (WA-19) | R2M, EWAG | Open | NFR-002 |
| A32 | D5.5 V1 integrates technically with the payment provider in test mode only. GSY DEX, the EWDS Client Gateway, exchange rates and the project UI are replaced by mocks behind the same interfaces, and real integrations follow in a later iteration. Item notes carry `v1_mode: mock` where this applies. (WA-20) | Blooo | Decided | REQ-001, REQ-002, REQ-029, REQ-041, REQ-048, REQ-053, NFR-017, REQ-052 |
| A33 | Invoices are issued through the payment provider's invoicing service on each producer's account. The provider's numbering per account is taken as meeting legal sequential numbering for self-billing, and its documents can carry the self-billing mention and the trade summary. (WA-21) | Legal/tax advisor, project DPO | Open | REQ-039, REQ-042, NFR-002 |

# Traceability rule

A requirement is not considered "ready" until it has: (1) at least one source user story above, and (2) at least one UAT test case in `uat-test-cases.md`.

**Source of truth**: the traceability data lives in one note per item under `items/` (`items/requirements/`, `items/user-stories/`, `items/uat/`, `items/personas/`), with properties (priority, scope, target release, links, UAT status). The editable matrix is [`traceability.base`](traceability.base) (Obsidian Bases) and the coverage checks are in [`traceability-dashboard.md`](traceability-dashboard.md) (Dataview). This document, `user-stories.md` and `uat-test-cases.md` are the readable narrative views, kept in sync with the item notes. The former `traceability-matrix.xlsx` is no longer maintained.

# Open review points

- **R-1 (REQ-038 / US-036)**: closed in v4 — deprecated, login failures are handled by the IdP.
- **REQ-002**: EUR/CHF conversion rule still open.
- **REQ-052**: split between the billing portal and the project UI to confirm.
- **A4 / REQ-008 / REQ-051**: source of the administrative data still open.

*Next: see `uat-test-cases.md` for the acceptance test scenarios that validate each requirement above.*
