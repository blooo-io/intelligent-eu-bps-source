# UAT Test Cases — Billing & Payment Service (T5.6 / D5.5)

Status: draft v5 (aligned with requirements v5, 2026-10-07). One primary UAT test case per requirement (`requirements.md`), written Given/When/Then. **UAT status is tracked in the item notes `items/uat/UAT-xxx.md` (property `status`: Not Run / Pass / Fail / Blocked), editable from [`traceability.base`](traceability.base)** and summarised in [`traceability-dashboard.md`](traceability-dashboard.md); this document is the readable narrative view.

Format: **UAT-ID** → tests **REQ-ID**. UAT for requirements at priority **W** (out of D5.5 scope: REQ-019...027, REQ-038) are kept but not executed in this phase.

## Billing calculation

**UAT-001** → REQ-001
Given settled trades of a billing period available in GSY DEX, including one trade indexed after its window was first queried and one trade returned twice, when the ingestion layer sends tradesQuery requests in windows of at most 24 h, re-queries recent windows and reads the responses through the Client Gateway, then every settled trade is stored exactly once (idempotent on tradeId), the late trade is captured, and each trade carries the delivery period of its Market.

**UAT-002** → REQ-002
Given settled trades between a consumer and two producers in a CHF community and an ECB EUR/CHF reference rate for the last business day of the period, when the billing engine runs, then one amount per consumer→producer pair is computed, converted to CHF at that rate, matching an independently calculated reference value, and the invoice shows the rate and its date.

**UAT-003** → REQ-003
Given a market in which one trade was matched bilaterally at a preferred rate (e.g. 12 ct/kWh) and other trades at the clearing price, when the billing engine runs, then each participant's energy amount uses the tradePrice of each trade (12 ct/kWh for the preference trade, the clearing price for the others), without any recomputation.

**UAT-004** → REQ-004 *(deprecated in v5)*
Given a pilot whose tariff data includes grid-fee, tax and levy components, and another pilot without grid-fee data, when the billing engine runs, then each provided component appears as a distinct line item with the correct amount, and the bill of the second pilot states that no grid-fee data was provided.

**UAT-005** → REQ-005
Given a billing run has already produced a balance for a participant, when the billing run is executed again for the same period (e.g. after a correction), then the prior balance record remains unchanged and a new versioned entry is created rather than an overwrite.

**UAT-006** → REQ-006
Given a community manager account and a configured billing period (e.g. monthly or quarterly), when they trigger or schedule a billing run for their pilot, then the run covers exactly that period and produces balances for that pilot's active members only.

**UAT-007** → REQ-007
Given an invoice covering several trades between a consumer and a producer in a community with a configured VAT rate, when either party views the invoice, then each trade appears with delivery period, kWh, price and amount, and the energy amount, VAT and total are correctly summed, with no grid-fee line.

**UAT-050** → REQ-039
Given a completed billing run producing an invoice between a consumer and a producer, when the invoice is issued, then a PDF in the producer's name addressed to the consumer, mentioning self-billing, is available to both parties, its totals match the computed amount, and both receive it by e-mail.

**UAT-053** → REQ-042
Given two producers each issuing invoices in two consecutive periods, when invoices are generated and published, then each producer's invoices follow their own sequence without gaps or reuse, numbers are shown on the PDF and cannot be modified, and the EWDS records carry only the invoiceId.

**UAT-054** → REQ-043
Given a community configured in virtual mode, when a billing run completes and the consumer pays, then invoices are issued, the payment runs in the Stripe test environment only, and no live payment is possible for that community.

**UAT-055** → REQ-044
Given an open invoice paid outside the platform, when an authorised community manager sets its status to Paid with a reason, then the status changes, the reason and actor are recorded in the audit trail, and a user without that role cannot change the status.

**UAT-071** → REQ-054
Given a consumer who bought energy from two producers during the period, when the billing run completes, then exactly two invoices are issued, one per producer, each covering all settled trades with that producer and each paid through a single payment.

**UAT-072** → REQ-055
Given two prosumers A and B where A bought 10 € from B and sold 4 € to B in the period, when the billing run completes, then one invoice of 6 € from B to A is issued and no invoice from A to B.

**UAT-073** → REQ-056
Given a pair with a net amount of 3 € in January and 4 € in February in a community with a 5 € threshold, when the January and February billing runs complete, then no invoice is issued in January, the 3 € are carried forward, and a 7 € invoice is issued in February.

## Administrative management (GDPR)

**UAT-008** → REQ-008
Given a CSV import by a community manager listing three new participants, when the import is processed, then three participant records and identity-provider accounts are created, invitations are sent, and each participant can complete their name and address after first login.

**UAT-009** → REQ-009
Given a logged-in participant, when they open and edit their billing profile, then they can update name, address and e-mail, but cannot change their GSY DEX actor identifier, meter or community, which only their community manager can change.

**UAT-010** → REQ-010
Given two participant accounts, when participant A attempts to read participant B's personal data via the API, then access is denied.

**UAT-011** → REQ-011
Given a participant whose data has passed the defined retention period with no active relationship, when the retention job runs, then their personal data is deleted or anonymized automatically.

**UAT-012** → REQ-012
Given an active participant with billing history, when a community manager offboards them, then no new billing run includes them, but their historical ledger/audit records remain queryable.

**UAT-013** → REQ-013
Given a valid erasure request submitted through the portal for a participant with past invoices, when the compliance stakeholder processes it, then personal data is erased or anonymised in billing, erasure requests are sent to the payment provider and the identity provider, invoices under legal retention are kept, and a confirmation is produced.

**UAT-062** → REQ-050
Given a producer who has not accepted the current Terms & Conditions, when a billing run is triggered or they open the portal, then no invoice is issued in their name until they accept the terms including the self-billing mandate, after which the version and timestamp are recorded.

**UAT-069** → REQ-053
Given settlement messages ingested through the billing Client Gateway and a message received 8 days ago, when the gateway clean-up job runs, then ingested messages and messages older than 7 days are no longer present in the gateway storage, while the normalized billing records remain.

**UAT-075** → REQ-058
Given ingested trades including one whose seller identifier is not in the registry, when the billing run completes, then known trades are attributed to the registered buyer and seller, and the unknown trade is flagged to the community manager and not invoiced.

## Fiat payments (Stripe)

**UAT-014** → REQ-014
Given a consumer with an open invoice from a producer who has a verified Stripe Connect account (test mode), when the consumer pays by card or SEPA Direct Debit, then a payment is created on behalf of the producer's connected account, succeeds, and no funds are held on the platform account.

**UAT-015** → REQ-015
Given a producer with a verified Stripe Connect account and a paid invoice (test mode), when the payment settles, then the amount appears on the producer's connected account and the Stripe payout to the producer's bank account is scheduled, without any platform-initiated transfer.

**UAT-016** → REQ-016
Given a Stripe charge or payout fails (simulated decline), when the webhook is received, then the payment record is flagged as failed with the reason, without manual polling.

**UAT-017** → REQ-017
Given a fiat payment succeeds or fails, when the status is finalized, then the participant receives a notification reflecting that outcome.

**UAT-018** → REQ-018
Given a completed billing period with a mix of successful and failed fiat payments, when a community manager opens the aggregated view, then counts and statuses match the underlying payment records.

**UAT-051** → REQ-040
Given a community member who has not yet completed payment-provider onboarding, when they are asked to pay or receive a payout, then the onboarding (e.g. Stripe customer / connected-account setup) is completed from within the platform flow without leaving it for a separate manual process, and the payment or payout can proceed once onboarding succeeds.

**UAT-056** → REQ-045
Given a producer whose Stripe Connect onboarding/KYC is not completed and trades sold by that producer, when a billing run is triggered, then no invoice is issued in that producer's name, the trades remain unbilled, and the blocking reason is reported to the producer and the community manager.

**UAT-063** → REQ-051
Given a new producer and a new consumer (Stripe test mode), when they complete onboarding from the portal, then the producer gets a verified connected account with identity check and bank account, the consumer gets a Stripe customer with a payment method, and their statuses are recorded.

**UAT-064** → REQ-052
Given the published billing API documentation and the reference screens, when a client application performs onboarding, views invoices, triggers an early settlement and a payment using only the APIs, then every step succeeds through the documented APIs, and the reference screens perform the same steps through the same APIs.

**UAT-074** → REQ-057
Given a consumer with unbilled trades with a producer in the middle of a period, when they request an early settlement for that producer, then an invoice covering those trades is issued and paid immediately, and the period-end invoice covers only the trades after the early settlement.

## Crypto payments — *deferred to D5.10*

**UAT-019** → REQ-019
Given a participant with a MetaMask/Ledger/WalletConnect-compatible wallet, when they connect it to the platform, then the connection succeeds and the wallet address is associated with their account.

**UAT-020** → REQ-020
Given a participant without a self-custody wallet, when they choose the custodial/embedded wallet option, then a DFNS (or equivalent) wallet is provisioned and usable for settlement.

**UAT-021** → REQ-021
Given a crypto settlement transaction is submitted, when it is confirmed on-chain, then the transaction hash and confirmation count are visible to the participant and recorded internally.

**UAT-022** → REQ-022
Given a crypto transaction fails or remains unconfirmed beyond a defined threshold, when the status check runs, then the transaction is flagged with its last known on-chain status rather than shown as indefinitely pending.

## AMM interface (T5.4) — *deprecated for D5.5, to be reassessed for D5.10*

**UAT-023** → REQ-023
Given a participant wants to swap an energy token for i-Euro, when they submit the swap via the AMM interface module, then the swap executes against the T5.4 AMM contracts and the resulting balances update correctly.

**UAT-024** → REQ-024
Given a buyer with insufficient collateral, when they attempt an AMM swap, then the system blocks the swap before submission and explains why.

**UAT-025** → REQ-025
Given a pending swap request, when the participant reaches the confirmation step, then the AMM's quoted price is displayed before they confirm.

## Stablecoin (i-Euro) — *deferred to D5.10*

**UAT-026** → REQ-026
Given a participant with a positive balance, when they request conversion to i-Euro, then the corresponding i-Euro amount is credited to their wallet/account.

**UAT-027** → REQ-027
Given an i-Euro balance movement occurs, when the ledger is queried, then the movement appears with the same audit fields (timestamp, actor, linked balance) as fiat/crypto payment records.

## Traceability & operations

**UAT-028** → REQ-028
Given a specific payment record, when an operator traces it, then the originating trade(s) and the balance calculation run that produced it are retrievable end-to-end.

**UAT-029** → REQ-029
Given three simulated situations — no settlement data beyond the defined threshold, the Client Gateway disconnected from the Message Broker, and an mTLS certificate within the expiry warning period — when the monitoring check runs, then an alert identifying the cause is raised to platform operators in each situation.

**UAT-030** → REQ-030
Given any read or write access to a participant's payment/personal data, when the action occurs, then an audit log entry is created with actor, action, target, and timestamp.

**UAT-052** → REQ-041
Given a billing period with computed balances, a mix of completed, failed and missing payments/payouts, and one market whose ingested trades are one short of its ClearingResult.numTrades, when the reconciliation runs, then every balance is matched to its payment or payout result, each discrepancy or incomplete settlement is flagged, and the incomplete market is flagged with the missing quantity.

**UAT-057** → REQ-046
Given a set of successful and failed payments, when the KPI log is queried, then each failed transaction has a cause and a suggested corrective action, and each payment has its processing time and payment method.

**UAT-058** → REQ-047
Given a completed billing period, when the KPI export runs, then amounts, kWh and components per participant and period are produced in the agreed format and match the underlying invoices.

**UAT-070** → REQ-048
Given a virtual-mode invoice covering three trades, paid in Stripe test mode, when the invoice is issued and the payment succeeds, then Invoice and Payment records are published on billingInvoice and billingPayment and validate against the agreed schemas, the invoice lists its three tradeIds, issuer and recipient, carries billingMode virtual and reaches status Paid, no payload contains personal data, and the trade statuses in GSY DEX are unchanged.

## Reporting & dispute resolution

**UAT-031** → REQ-031
Given a member disputes a bill, when a community manager looks up that member's full billing/payment history, then all relevant records (trades, balance, payment attempts) are retrievable in one view.

**UAT-032** → REQ-032
Given a completed billing period, when the periodic summary report is generated, then billed, collected, paid-out, and failed totals match the sum of underlying records.

## Non-functional requirements

**UAT-033** → NFR-001
Given data in transit and at rest, when a security scan/config review is performed, then TLS is enforced end-to-end and sensitive fields are encrypted at rest.

**UAT-034** → NFR-002
Given the database configuration, when infrastructure settings are reviewed, then the hosting region is confirmed as the EU or a country covered by an EU adequacy decision.

**UAT-035** → NFR-003
Given any balance or payment record, when an attempt is made to modify it directly (bypassing the append-only API), then the attempt is rejected or structurally impossible (DB-level constraint).

**UAT-036** → NFR-004
Given the internal data model, when it is compared against the INTELLIGENT ontology, then billing, invoice, payment, Stripe payment, actor, address, contact details, user account, trade, market, clearing result and tariff structures map onto the corresponding ontology classes without unresolved gaps.

**UAT-037** → NFR-005
Given the codebase at the point of intended GitHub publication, when a secrets/dependency scan is run, then no credentials or unresolved proprietary lock-in are present.

**UAT-038** → NFR-006
Given Stripe, a blockchain RPC provider, or EWDS is simulated as briefly unavailable, when a billing/payment operation is attempted, then the system retries per policy and/or surfaces a clear failure state rather than hanging or silently dropping the operation.

**UAT-039** → NFR-007
Given a participant with no wallet and no blockchain experience, when they complete onboarding and pay a bill using only the fiat rail, then no step requires crypto knowledge or a wallet.

**UAT-040** → NFR-008
Given a pilot's full membership, when a standard billing run executes, then it completes within the agreed time window (value to confirm with pilots during requirements validation).

**UAT-041** → NFR-009
Given a pilot that only uses the fiat rail (no crypto/AMM/stablecoin), when the system operates for that pilot, then no crypto-specific step is required or blocking.

**UAT-042** → NFR-010
Given the full requirements list, when the traceability matrix is reviewed, then every REQ/NFR row has at least one linked UAT ID with a non-empty status.

**UAT-059** → NFR-012
Given the repository at the point of publication, when licence files and dependencies are reviewed, then LICENSE (Apache-2.0) and NOTICE files are present and no GPL code is linked into the service.

**UAT-061** → NFR-013
Given the billing service running against the project IdP, when its configuration is switched to another standards-compliant OIDC IdP (test instance), then login, role mapping and logout work without code change, and a code review finds no IdP-vendor-specific API calls.

**UAT-065** → NFR-014
Given the billing service configured with the mock PSP adapter, when the full test suite and an end-to-end billing run are executed, then they pass without contacting any real payment provider, and no billing module imports the Stripe SDK directly.

**UAT-066** → NFR-015
Given a webhook with an invalid signature and a valid one, when both are sent to the webhook endpoint, then the invalid one is rejected and logged without personal data, the valid one is processed, and a plain-HTTP call to the API is refused.

**UAT-067** → NFR-016
Given a representative pilot user with no prior training, when they complete onboarding, KYC and a payment, then each journey stays within the agreed number of steps and the user completes it without assistance.

**UAT-068** → NFR-017
Given the deployed billing Client Gateway, when its configuration and network exposure are reviewed and calls are made to its API without and with the API key from inside and outside the billing network, then it runs in the EU or an adequacy country in API mode, only key-authenticated calls from the billing network succeed, the gateway key is stored in the key vault, and the Message Broker connection uses the EWF mTLS certificate.

## Authentication & SSO

**UAT-043** → REQ-033
Given a user registered in the IdP configured for their community, when they open the billing portal, then they are redirected to the IdP login page, return with an authenticated session after login, and the billing service never prompts for nor stores a password.

**UAT-044** → REQ-034
Given community A using the project IdP and community B configured with a pilot OIDC IdP, when a member of each community starts a login, then each member is redirected to the issuer configured for their own community, never to the other one.

**UAT-045** → REQ-035
Given a successful authentication at the IdP, when the user is redirected back to the platform with an authorization code, then the platform exchanges it for tokens using PKCE and establishes an authenticated session without further prompts.

**UAT-046** → REQ-036
Given the platform's OIDC configuration store, when it is reviewed, then it contains only issuer, client ID and secret references per community, and no user passwords or IdP credentials.

**UAT-047** → REQ-037
Given a community using the project IdP, when an operator switches its configuration to a test pilot OIDC IdP, then members of that community can log in through the new IdP without any code change or redeploy.

**UAT-048** → REQ-038 *(deprecated in v4)*
Given a member's SSO login fails at the IdP, when the community manager opens their pilot's login status view, then the failed attempt (and its reason, if the IdP provided one) is visible.

**UAT-049** → NFR-011
Given an ID token presented to the platform, when it is validated, then signature, issuer and audience are checked, and a token from an issuer not configured for the user's community is rejected.

**UAT-060** → REQ-049
Given users holding the member, community-manager and operator roles in two communities, when each calls the billing APIs, then each can access only the functions of their role and the data of their own community, as given by the token claims.

*Next: see [`traceability-dashboard.md`](traceability-dashboard.md) for the Requirement ↔ User Story ↔ UAT ↔ Status view.*
