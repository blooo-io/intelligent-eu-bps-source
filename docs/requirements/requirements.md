# Requirements — Billing & Payment Service (T5.6 / D5.5)

Status: draft v6.1 (2026-11-24): **source alignment + arbitrations** — the project source documents are the reference; two-level billing model (monthly participant statement + legal invoices per consumer→producer pair in the producer's name, paid directly to the producer, platform never holds funds), payouts from the producer's connected account, no early settlement, project UI through the EWDS only (reads + command channel), KYC for all users, in-house PDF invoices, grid-fee structure kept for D5.10, see § Source alignment v6. Earlier: v5 (2026-10-07): v5 = working assumptions A13–A31 applied (producer-as-bank billing model, fees off-platform, virtual V1 with Stripe test mode); v4.2 = alignment with the GSY DEX v2 code and EWDS docs (REQ-001, 003, 004, 041, 042, 048, 053, NFR-017); v4 = identity model (project OIDC IdP), Stripe-only fiat methods, full Apache-2.0 publication and D5.5 scope clarifications; v4.1 = EWDS Client Gateway integration (REQ-001, REQ-029, REQ-053, NFR-004, NFR-017, assumption A12). Previous version: v3 (2026-09-24). Every requirement below traces back to one or more user stories in `user-stories.md`, and forward to at least one UAT test case in `uat-test-cases.md`. IDs are stable once assigned — do not renumber; deprecate instead.

**Out of D5.5 scope (v6):** grid-fee, levy and tax amounts until DSO tariff data exist (REQ-004, D5.10), imbalance penalties (A18), community bonus and incentives (A30), crypto, AMM and stablecoin (D5.10). **V1 integration:** only Stripe (test mode) is integrated; the other external systems are mocked (A32).

Priority: **M**ust / **S**hould / **C**ould / **W** = Won't-this-phase (MoSCoW), inherited from the source user story unless noted otherwise. Requirements marked **W** are out of scope for D5.5 and kept for traceability (previous priority in brackets). The item notes carry a `target_release` property: **D5.5** (V1, M24) or **D5.10** (V2, M30).

# Functional requirements

## Billing calculation

| ID | Requirement | Priority | Source (user stories) |
|---|---|---|---|
| REQ-001 | The system shall obtain the trades of a billing period from GSY DEX over the EWDS, through its Client Gateway, by sending tradesQuery requests (time windows of at most 24 h, recent windows re-queried to catch late trades) and clearingResultsQuery / marketsQuery requests on the GSY request channel (topic owner integration.apps.intelligent.auth.ewc, version 1.0.0), and reading the matching responses. Only trades with status settled are billed; ingestion is idempotent on tradeId; the delivery period of a trade is taken from its Market (deliveryStartTime/deliveryEndTime), not from the trade timestamp. The GSY off-chain storage REST API may be used for backfill or reconciliation where network access is granted. | M | US-001, US-005 |
| REQ-002 | The system shall compute, for each billing period, the amount owed for each consumer→producer pair from the settled trades between them, and each participant's net balance of the period (value sold minus value bought). Trade prices are taken as EUR (or the adjusted price when GSY DEX provides one); for communities whose currency is not EUR (e.g. CHF), amounts are converted at the reference rate set for the community and each invoice is issued in a single currency, the community currency, showing the rate and its date. | M | US-001, US-002, US-048 |
| REQ-059 | The system shall produce, for each billing period, one statement per participant (ontology Billing record) showing the total bought, the total sold, the net balance, and the list of the participant's invoices with their status; the statement is informative and not a payable document. | M | US-048 |
| REQ-003 | The system shall use the trade price provided by GSY DEX (tradePrice, which already includes any bilateral preference rate agreed between trading partners) as the final energy price of each trade, and shall not recompute or adjust it. | S | US-003 |
| REQ-004 | The system shall include in each invoice the grid-fee, levy and tax components derived from the tariff data published for the community on the EWDS by the DSO / grid operator (ontology Tariff class), as soon as such data are available; until then the grid-fee amount is 0 and the invoice states that grid fees are billed by the supplier or DSO. *(Target D5.10.)* | S (was W) | US-004 |
| REQ-005 | The system shall persist every billing calculation as an immutable, versioned ledger entry; a balance is never overwritten in place. | M | US-005 |
| REQ-006 | The system shall allow a community manager to trigger or schedule a billing run per pilot/community, with a configurable billing period (monthly by default, up to quarterly). | M | US-006 |
| REQ-007 | The system shall show on each invoice the producer (issuer), the consumer (addressee), the trades covered (delivery period, kWh, price per kWh, amount), the energy amount, the grid-fee amount, the tax amount (VAT rate configurable per community, 0 by default) and the total. The grid-fee amount is 0 until tariff data are available (REQ-004). | M | US-002 |
| REQ-039 | The system shall generate, for each invoice, a PDF produced by the billing service (not by the payment provider), issued in the name of the producer with the self-billing mention and addressed to the consumer, showing the trades covered and the amounts; store it in the billing database, make it available to both parties and to the community manager, and send it to both parties by e-mail when it is issued. | M | US-037 |
| REQ-042 | The system shall assign each invoice a unique, sequential and immutable legal invoice number at issue time, in a numbering series per producer (issuer) owned by the billing service, shown on the PDF; the number is not published on the EWDS, where invoiceId remains the shared identifier. | M | US-037 |
| REQ-043 | The system shall support a per-community billing mode, live or virtual; in virtual mode, invoices are computed and issued and payments run only in the payment provider's test environment (no real money). In D5.5 V1 all communities run in virtual mode. | M | US-040 |
| REQ-044 | The system shall manage invoice statuses (Draft, Open, PartiallyPaid, Paid, Overdue, Void, Disputed) and allow an authorised community manager to change a status manually, with a mandatory reason and an audit trail. | S | US-041 |
| REQ-054 | The system shall issue, for each billing period, one invoice per consumer→producer pair covering all settled, not yet invoiced trades between them, issued in the name of the producer (self-billing) and addressed to the consumer, paid directly to the producer (REQ-014) and listed in both participants' statements (REQ-059). | M | US-045, US-046 |
| REQ-055 | The system shall net, within a billing period, the purchases and sales between the same two participants, and issue a single invoice in the direction of the net amount. | M | US-045 |
| REQ-056 | The system shall not invoice a pair whose net amount for the period is below a minimum threshold configurable per community (default 5 EUR / 5 CHF); the amount is carried forward to the next period, and an invoice is forced at the end of the calendar year or when a participant leaves the community. | S | US-045 |

## Administrative management (GDPR)

| ID | Requirement | Priority | Source (user stories) |
|---|---|---|---|
| REQ-008 | The system shall obtain participants' administrative data (Actor, Address, ContactDetails, community, GSY DEX actor identifier, meter, role) exclusively from the EWDS Actor topic. The project UI (R2M) creates and updates those Actor records (CSV in R2M = one Actor message per row); billing only ingests and synchronises. | M | US-007 |
| REQ-009 | On the project path, billing-profile changes (name, address, contact e-mail) arrive as republished EWDS Actor records from the project UI; on the reference client, a participant may update their own billing profile via `/v1`. Trade-attribution identifiers (GSY DEX actor identifier, meter, community) change only via Actor republication / community manager on the Actor source — never by the member alone. | M | US-008 |
| REQ-010 | The system shall enforce access control so a participant can read only their own personal data. | M | US-009 |
| REQ-011 | The system shall define and enforce a retention period for personal data, after which it is deleted or anonymized. | M | US-010 |
| REQ-012 | The system shall support offboarding a participant from active billing while retaining historical ledger/audit records. | S | US-011 |
| REQ-013 | The system shall support exporting or confirming deletion of a participant's personal data upon a valid GDPR data-subject request received from the EWDS (issued by the pilot data controller), through the portal or from the community manager, and shall propagate erasure to the payment provider and the identity provider using the stored external identifiers; invoices and accounting records are kept for the legal retention period. | S | US-012 |
| REQ-050 | The system shall require each participant and community manager to accept the current version of the INTELLIGENT Terms & Conditions of Use before billing is activated for them, including, for producers, the mandate allowing the platform to issue invoices in their name (self-billing), and record the accepted version and timestamp. | M | US-044 |
| REQ-053 | The system shall purge message payloads cached by its EWDS Client Gateway once they have been ingested, using the gateway's message clean-up job, and in any case no later than 7 days after reception. | M | US-010 |
| REQ-058 | The system shall maintain a participant registry linking each participant's identifier (Actor UUID) to their GSY DEX actor identifier, community and meter, maintained by the community manager, and use it to attribute every ingested trade to a buyer and a seller; trades whose parties are unknown are flagged and not invoiced. | M | US-007 |

## Fiat payments (Stripe)

| ID | Requirement | Priority | Source (user stories) |
|---|---|---|---|
| REQ-014 | The system shall let a consumer pay each invoice addressed to them directly to the producer's payment-provider connected account (direct charge, card or SEPA Direct Debit), so that the platform never holds the funds; the payment is started from the project UI through the EWDS command channel (the reply carries a payment-provider hosted page), from the billing portal, or automatically when the consumer has enabled automatic payment. Twint and PayPal are out of scope. | M | US-013, US-046, US-048 |
| REQ-015 | The system shall keep each producer's connected account on a manual payout schedule and pay out the available balance to the producer's bank account when the producer requests a withdrawal (EWDS command or billing portal) or automatically if the community enables it; a withdrawal for a period is allowed once all invoices of that period where the participant is the producer are Paid, and a payout is forced before the payment provider's holding limit. | M | US-014, US-046, US-048 |
| REQ-016 | The system shall detect and flag failed Stripe charges/payouts with a failure reason, via webhook rather than polling. | M | US-015 |
| REQ-017 | The system shall notify a participant of the success or failure of a fiat payment. | S | US-016 |
| REQ-018 | The system shall provide an aggregated view of fiat payment status across all participants for a given billing period. | S | US-017 |
| REQ-060 | The system shall provide to the community manager the payouts per participant with their status (completed / open), and to each participant their own payouts per billing period. | S | US-049 |
| REQ-040 | The system shall integrate the payment-provider onboarding required for fiat payments and payouts into the platform flow, minimising additional steps for community members. | M | US-039 |
| REQ-045 | The system shall not generate invoices, nor execute any payment or payout, for a participant or community manager until their KYC has been verified (UserAccount.kycVerified = true); a payout additionally requires a verified payout account. | M | US-039 |
| REQ-051 | The system shall onboard every participant (consumer, producer, prosumer) on the payment provider with a connected account whose onboarding includes the identity verification (KYC), and verify each community manager's identity through the payment provider's identity verification; it stores the verification result and its logs in the billing database and sets the kycVerified flag. | M | US-039 |
| REQ-052 | The system shall interact with the project UI only through the EWDS: the UI reads the records published under REQ-048, and sends its actions (start a payment, request a withdrawal, change an invoice status, start KYC, accept terms, send a reminder, trigger a billing run, set up a payment method) as requests on the billing command channel, answered on the EWDS; where a card or IBAN entry, a strong customer authentication, a SEPA mandate or an identity verification is needed, the reply carries, as the UI requests, either a payment-provider hosted page URL or the short-lived session data needed to display the payment provider's embedded components in the UI; card data, IBANs and identity documents never transit through the billing service or the EWDS. There is no direct link or API call between the project UI and the billing service; the billing REST API serves the reference web application only. | M (was S) | US-013, US-014, US-037 |
| REQ-057 | The system shall let a consumer settle early, at any time, the not yet invoiced trades with a given producer: an invoice is issued immediately for these trades and paid, and the next periodic invoice only covers the remaining trades. *(Deprecated — source alignment.)* | W (was S) | US-047 |

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
| REQ-023 | The system shall support token swaps (energy token ⇄ i-Euro) via the AMM interface. *(Deprecated — source alignment.)* | W (was S) | US-022 |
| REQ-024 | The system shall verify a buyer holds sufficient collateral before executing an AMM swap on their behalf. *(Deprecated — source alignment.)* | W (was M) | US-023 |
| REQ-025 | The system shall display the AMM's quoted price to a participant before they confirm a swap. *(Deprecated — source alignment.)* | W (was C) | US-024 |

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
| REQ-046 | The system shall log every failed transaction with its cause and suggested corrective action (KPI UE-3), and the processing time and the fee of each payment per payment method (KPI TE-2, GA expected result ER1.4 'transaction times and costs compared between different payment methods'). | M | US-042 |
| REQ-047 | The system shall export, per participant and per period, the amounts invoiced and paid, the kWh and the components (energy, VAT) for the KPI calculations of WP6 and GSY DEX Analytics (EC-1, EC-2); the system does not compute EC-1/EC-2 nor compare with a baseline bill. | S | US-042 |
| REQ-048 | The system shall publish on the EWDS, through its Client Gateway, each monthly participant statement (billingStatement), each issued invoice with issuing producer, addressed consumer, tradeIds and paymentIds (billingInvoice), each payment status change (billingPayment), each payout status change (billingPayout) and each participant's KYC status (billingKycStatus), on topics created by EWAG from JSON schemas proposed by Blooo (owner integration.apps.intelligent.auth.ewc), based on the INTELLIGENT Billing, Invoice, Payment and UserAccount schemas and extended with billingMode (live/virtual). The system shall not change trade statuses. Payloads contain no personal data (no PSP details, no Actor details, no legal invoice number). | M | US-027 |

## Reporting & dispute resolution

| ID | Requirement | Priority | Source (user stories) |
|---|---|---|---|
| REQ-031 | The system shall allow a community manager to retrieve a participant's full billing/payment history. | M | US-030 |
| REQ-032 | The system shall generate a periodic summary report of billed, collected, paid-out, and failed amounts per community. | S | US-031 |
| REQ-061 | The system shall let a community manager send payment reminders by e-mail for open invoices, and shall alert the community manager of missing payments after the invoice due date. | S | US-049 |

## Authentication & SSO

Users authenticate via OAuth2/OIDC against a **project Identity Provider** (e.g. Keycloak). *(v6: the operator of the project IdP is to be confirmed by the consortium, see A11; the project deliverables describe DID/VC identities through the EWDS, REQ-062.)* The IdP is an **external, replaceable component**: a pilot may later replace it with its own OIDC IdP through configuration only. The billing service is an OIDC relying party and never stores passwords. OIDC only in this phase (SAML 2.0 out of scope).

| ID | Requirement | Priority | Source (user stories) |
|---|---|---|---|
| REQ-033 | The system shall authenticate all users (community members, community managers, operators) exclusively via OAuth2/OIDC against the Identity Provider configured for their community — by default the project identity provider; the billing service shall never issue or store user passwords. | M | US-032, US-034 |
| REQ-034 | The system shall resolve, from configuration, the OIDC issuer to use for each community (the project IdP by default, or a pilot's own OIDC IdP where configured) and redirect the user to that issuer at login. | S (was M) | US-033 |
| REQ-035 | The system shall complete the OAuth2 Authorization Code flow (with PKCE) against the resolved IdP and establish an authenticated session on successful return. | M | US-032, US-033 |
| REQ-036 | The system shall store, per community, only the OIDC client configuration required to authenticate (issuer URL, client ID, reference to the client secret held in a secrets store) — never user passwords or IdP credentials. | M | US-034 |
| REQ-037 | The system shall allow an operator to switch a community from the project IdP to a pilot's own OIDC IdP (or back) through configuration, without a code deployment. | S | US-035 |
| REQ-038 | The system shall surface SSO login failures (e.g. IdP unreachable, consent denied) to the community manager for members of their own pilot. *(Deprecated — source alignment.)* | W (was C) | US-036 |
| REQ-049 | The system shall derive each user's role (community member, community manager, operator) and community membership from the claims of the tokens issued by the IdP, and enforce authorisations accordingly. | M | US-043 |
| REQ-062 | The system shall accept users authenticated with the project's decentralised identity (W3C DID and Verifiable Credentials issued through the EWDS, ontology UserAccount.authProvider = EWDS-DID) as soon as the project identity solution provides it, without storing user credentials. *(Target D5.10.)* | C | US-050 |

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

# Source alignment v6 (2026-11-24)

Rule: the source documents of the project (Grant Agreement Annex 1, consortium deliverables, the D5.5 scope and architecture document, and the ontology workbook) define what the service must be. Precedence: Grant Agreement → public deliverables (latest version) → D5.5 scope and architecture → ontology. Where the v5 spec contradicted them, it was changed:

| Topic | v5 | v6 (source) | Items |
|---|---|---|---|
| Billing model | One invoice per pair in the producer's name, pair netting, threshold, early settlement, direct payment | Two levels: monthly statement per participant (net balance) + legal invoices per pair in the producer's name, paid directly to the producer; threshold kept; early settlement removed; payouts from the producer's connected account | REQ-002, 014, 015, 054..056, 059; REQ-057 deprecated |
| Project UI | Calls the billing REST APIs | Through the EWDS only: reads published records, actions on the billing command channel, hosted payment-provider pages in replies | REQ-048, REQ-052 |
| KYC | Producers only | All participants and community managers, gates any financial transaction (kycVerified) | REQ-045, REQ-051 |
| Participant data | Project UI (R2M) publishes Actor | Delivered exclusively through the EWDS Actor topic | REQ-008 |
| Grid fees | Never on P2P invoices | Energy / grid fee / tax structure; grid fees once DSO tariffs exist (D5.10) | REQ-004, REQ-007 |
| GDPR erasure | Portal or community manager | Also from the EWDS | REQ-013 |
| Invoices | Payment provider's invoicing on producer accounts | PDF generated and stored by the billing service, in the producer's name, numbering per producer | REQ-039, REQ-042 |
| KPI ER1.4 | Time per payment method | Time and fee per payment method | REQ-046 |
| Community manager | — | Payout overview, reminders | REQ-060, REQ-061 |
| Identity | OIDC IdP operated by Blooo | IdP operator to confirm; DID/VC through the EWDS as target (D5.10) | REQ-033, REQ-062, A11 |

**Blooo design choices kept (not contradicted by the sources, not stated by them):** monthly default period up to quarterly (A1), EUR→CHF conversion rule (A16), exact decimal rounding (A17), no imbalance penalties in D5.5 (A18), virtual mode for all communities in V1 with the payment provider in test mode (A22, consistent with D6.1), KPI export instead of baseline comparison (A23), 7-day Client Gateway cache (A26), billing topics proposed to EWAG (A28), no bonus/incentives (A30), EU hosting (A31), EWDS adapters live in deployed environments, mocks only locally and in tests (A32), full Apache-2.0 publication (NFR-012, consistent with the Grant Agreement; the D5.5 scope document's hybrid closed model is superseded).

# Assumptions & dependencies

Working assumptions on which this specification relies. Each one must be confirmed by the partner indicated; a change may modify the requirements listed.

| # | Assumption / dependency | To confirm with | Status | Affects |
|---|---|---|---|---|
| A1 | Billing is computed monthly by default; some pilots may need longer periods (up to quarterly). | Pilot owners (WP6) | Partly confirmed | REQ-006 |
| A2 | The billing calculation is performed by the billing service, not by the EWDS (transport layer only). | GSY, EWAG | Confirmed | REQ-001, REQ-002 |
| A3 | Payment details of participants are held by the payment provider (Stripe Connect accounts), not by the billing service. | Blooo | Confirmed | REQ-015, REQ-051 |
| A4 | Administrative data for invoicing (Actor, Address, ContactDetails) are delivered exclusively through the EWDS. The project UI (R2M) is the sole publisher for create/update (CSV in R2M = N Actor messages). No billing-service CSV fallback on the project path (INT-447). | R2M, EWAG | Decided (INT-447) | REQ-008, REQ-009, REQ-051 |
| A5 | Personal data, KYC results and invoices are stored in a dedicated, access-controlled store of the billing service. | Blooo, project DPO | Open | REQ-010, REQ-011, NFR-001 |
| A6 | GDPR erasure requests originate from the EWDS (pilot data controller) and are propagated to billing (source: D5.5 scope H6), and can also come through the portal or the community manager; billing propagates them to the payment provider and the identity provider. | EWAG, project DPO | Open (EWAG to confirm) | REQ-013 |
| A7 | A shared project integration environment (synthetic or anonymised data, end-to-end tests) is available. | R2M, EWAG, GSY | Open | UAT execution |
| A8 | Platform-level CI/CD pipelines (unit, contract and end-to-end tests) are available. | EWAG, R2M | Open | NFR-010, UAT execution |
| A9 | Real payments and legally binding invoices only at pilots allowing live billing; virtual billing elsewhere. | Pilot owners, R2M | Confirmed | REQ-043 |
| A10 | Billing uses the cleared off-chain trades published on the EWDS, whatever the trading mechanism (GSY DEX or AMM); no AMM integration in D5.5. | GSY, UoC | Confirmed | REQ-001, REQ-023...025 |
| A11 | Identity is provided by a project OIDC IdP (e.g. Keycloak), replaceable by a pilot OIDC IdP. The project deliverables describe DID/VC identities through the EWDS (GA IP9, D3.1, D6.1); the IdP choice and its operator are to be confirmed in writing by the consortium. | Consortium | To confirm (v6) | REQ-033..037, REQ-049, REQ-062, NFR-011, NFR-013 |
| A12 | The EWDS topic schemas for EnergyTrade, ClearingResult and Tariff (not yet published in the EWAG schema repository), with their topic owner and channel names, are published by EWAG/GSY, and the billing gateway is granted the role needed to subscribe to them. **Blocking dependency for REQ-001.** | EWAG, GSY | Open | REQ-001, REQ-004, REQ-029 |
| A13 | Trades are obtained from GSY DEX through the EWDS only (request/reply on the GSY request channel or subscription to settlement outputs). The GSY DEX off-chain storage REST API is used only as a development and test fixture, never as a production path (D3.1: no bilateral API contract between project services). | GSY | Revised (v6) | REQ-001 |
| A14 | Billing keeps a participant registry linking Actor UUID, GSY DEX actor identifier, community and meter. The community manager maintains it. (WA-02) | GSY, pilots | Open | REQ-008, REQ-058 |
| A15 | Billing reads tariff data published on the EWDS by the DSO / grid operator (Tariff class) as soon as they exist (D4.5, M30). V1 has no tariff data, so the grid-fee amount is 0. (WA-03, revised) | EWAG, ERE | Revised (v6) | REQ-004 |
| A16 | Trade prices are in EUR. CHF communities are converted at the ECB reference rate. Each invoice is issued in the community currency. (WA-04) | GSY, AEM, HSLU | Open | REQ-002 |
| A17 | Timestamps are accepted as epoch or RFC 3339. Values are already unscaled. Amounts use exact decimals, rounded per line. (WA-05) | GSY | Open | REQ-001, REQ-002 |
| A18 | Imbalance penalties are not invoiced in D5.5. (WA-06) | GSY | Open | — |
| A19 | Two-level billing model: monthly statement per participant (net balance, informative) and legal invoices per consumer→producer pair, issued in the producer's name (self-billing), netted per pair, below-threshold amounts carried forward, paid directly to the producer's connected account; no early settlement; the platform never holds funds. (WA-07, revised v6.1) | Pilots, legal review | Decided (v6.1) | REQ-002, REQ-014, REQ-015, REQ-039, REQ-042, REQ-050, REQ-054..056, REQ-059 |
| A20 | Grid fees, taxes and levies are billed today by the supplier or DSO in all pilots, so V1 invoices carry a grid-fee amount of 0; the invoice structure keeps energy / grid fee / tax as in the ontology, and grid fees are added when the DSO tariff data are available (REQ-004, D5.10). (WA-08, revised) | EWAG, ERE, pilots | Revised (v6) | REQ-004, REQ-007 |
| A21 | **Withdrawn (INT-447).** Replaced by A4 EWDS-only: no interim manager CSV / billing-portal completion on the project path. KYC via the payment provider remains required for all participants and community managers. | — | Withdrawn | REQ-008, REQ-009, REQ-051 |
| A22 | In D5.5 V1, all communities run in virtual mode, with the payment provider in test mode. (WA-10) | WP6 (HSLU), R2M | Open | REQ-043 |
| A23 | Comparison with a baseline bill and the EC-1/EC-2 computation are done by WP6 / GSY Analytics from the billing export. (WA-11) | HSLU, GSY | Open | REQ-043, REQ-047 |
| A24 | GDPR requests reach billing from the EWDS, through the portal or from the community manager (see A6). (WA-12, revised) | EWAG, project DPO | Revised (v6) | REQ-013 |
| A25 | Each community operator (pilot manager) is the data controller; the billing provider acts as its processor (D3.1 §3, consortium Option A). (WA-13; self-billing mandate removed in v6) | R2M, project DPO | Partly confirmed | REQ-050, NFR-002 |
| A26 | Client Gateway cache is retained for 7 days at most. (WA-14) | Project DPO, EWAG | Open | REQ-053 |
| A27 | The project UI integrates through its Client Gateway and the EWDS only (published records and the billing command channel); the billing REST API serves the reference web application only. (WA-15, replaced v6.1) | R2M, EWAG | Decided (v6.1) | REQ-048, REQ-052 |
| A28 | The billing topics billingInvoice and billingPayment are created by EWAG from schemas proposed by Blooo. (WA-16) | EWAG | Open | REQ-048 |
| A29 | The billing service exchanges only EWDS messages with the other project services and links no GSY DEX or EWDS code, so it is a separate work and can be Apache-2.0. Note: D3.1 states that the EWDS code is GPL-3.0; the licence of the EWDS schemas must be checked. (WA-17) | EWAG, GSY | Open | NFR-012 |
| A30 | Community bonus and incentives are out of D5.5. (WA-18) | R2M, AEM | Open | — |
| A31 | D5.5 is due at M24 = 30/11/2026. Hosting is in the EU. (WA-19) | R2M, EWAG | Open | NFR-002 |
| A32 | D5.5 V1 runs the EWDS Client Gateway adapters live in every deployed environment (trade source on the GSY DEX request channel, publication of billing records, Actor intake, erasure requests, tariffs, project-UI command channel); the payment provider runs in test mode; mocks are used only for local development and automated tests. Roles or topics not yet granted on the EWDS are alerted (REQ-029) and tracked as external dependencies. (WA-20, revised v6.1) | Blooo, EWAG | Decided (v6.1) | REQ-001, REQ-008, REQ-013, REQ-029, REQ-048, REQ-052, REQ-053, NFR-017 |
| A33 | ~~Invoices are issued through the payment provider's invoicing service on each producer's account.~~ **Invalidated in v6**: the billing module generates and stores the PDF invoices (D5.5 scope §7.2 steps 10-11; D6.1 Scenario 1.4). (WA-21) | Legal/tax advisor, project DPO | Invalidated (v6) | REQ-039, REQ-042, NFR-002 |

# Traceability rule

A requirement is not considered "ready" until it has: (1) at least one source user story above, and (2) at least one UAT test case in `uat-test-cases.md`.

**Source of truth**: the traceability data lives in one note per item under `items/` (`items/requirements/`, `items/user-stories/`, `items/uat/`, `items/personas/`), with properties (priority, scope, target release, links, UAT status). The editable matrix is [`traceability.base`](traceability.base) (Obsidian Bases) and the coverage checks are in [`traceability-dashboard.md`](traceability-dashboard.md) (Dataview). This document, `user-stories.md` and `uat-test-cases.md` are the readable narrative views, kept in sync with the item notes. The former `traceability-matrix.xlsx` is no longer maintained.

# Open review points

- **R-1 (REQ-038 / US-036)**: closed in v4 — deprecated, login failures are handled by the IdP.
- **REQ-002**: EUR/CHF conversion rule still open.
- **REQ-052**: how UI-originated commands travel on the EWDS.
- **A11 / REQ-033**: identity provider choice and operator to confirm in writing.
- **REQ-059 / REQ-015**: who holds and disburses funds under the net-balance model (Stripe Connect separate charges and transfers) — legal check.
- **A4 / REQ-008 / REQ-051**: source of the administrative data still open.

*Next: see `uat-test-cases.md` for the acceptance test scenarios that validate each requirement above.*
