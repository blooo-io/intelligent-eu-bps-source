# User Stories — Billing & Payment Service (T5.6 / D5.5)

Status: draft v5 (2026-10-07). Each story references a persona from `personas.md` and belongs to one epic. Priority uses MoSCoW (Must / Should / Could / **W** = Won't-this-phase). These stories are the direct input to `requirements.md` — every requirement must trace back to at least one story here. Each story also exists as an item note in `items/user-stories/` (source of truth for traceability, see `traceability-dashboard.md`).

Epics: **AUTH** (authentication/SSO) · **BILL** (billing calculation) · **ADMIN** (administrative/GDPR) · **FIAT** (fiat payments) · **CRYPTO** (crypto payments) · **AMM** (AMM interface) · **STABLE** (stablecoin) · **OPS** (platform operations/traceability) · **REPORT** (reporting/disputes)

**Scope for D5.5**: the CRYPTO and STABLE epics are **deferred to D5.10** (V2, M30); the AMM epic is **deprecated for D5.5** (billing uses cleared trades whatever the trading mechanism) and will be reassessed for D5.10. Their stories are kept for traceability with priority **W** (previous priority in brackets).

---

## Epic: AUTH — Authentication & SSO

Key context (v4, identity workshop 02/10/2026): users log in through a **project OIDC Identity Provider (e.g. Keycloak) operated by Blooo** for the project. The IdP is an external, replaceable component: a pilot may later plug in its own OIDC IdP through configuration. The billing service is an OIDC relying party and never stores passwords.

| ID | Persona | Priority | Story |
|---|---|---|---|
| US-032 | P1/P2/P3 Community member | Must | As a community member, I want to log in to the billing and payment services with a single project account, so that I don't need separate credentials for each service. |
| US-033 | P6 Platform Operator | Should (was Must) | As a platform operator, I want each community to use the project IdP by default, or its pilot's own OIDC IdP when the pilot provides one, so that pilots that already have an identity system can reuse it. |
| US-034 | P7 Compliance/DPO | Must | As a compliance stakeholder, I want the billing service never to receive or store users' passwords, so that credential custody stays with the identity provider. |
| US-035 | P6 Platform Operator | Should | As a platform operator, I want to switch a community to its pilot's own OIDC IdP through configuration rather than a code change, so that the project IdP can be replaced without redeploying the billing service. |
| US-036 | P4 Community Manager | W (was Could) | As a community manager, I want to see which of my members failed SSO login (and why, if the IdP provides a reason), so that I can help members stuck at their IdP's login screen. *(Deprecated in v4 — R-1.)* |
| US-043 | P6 Platform Operator | Must | As a platform operator, I want users' roles and community membership to be managed in the identity provider and applied by the billing service, so that access rights are administered in a single place. |

## Epic: BILL — Billing calculation

| ID | Persona | Priority | Story |
|---|---|---|---|
| US-001 | P1 Prosumer | Must | As a prosumer, I want my billing period's balance to reflect exactly the trades I executed on GSY DEX, so that I trust the amount I owe or am owed. |
| US-002 | P2 Consumer | Must | As a consumer-only member, I want to see a clear breakdown of my bill (energy cost, grid fee, community fee), so that I understand what I'm paying for. |
| US-003 | P1 Prosumer | Should | As a prosumer, I want ex-post price adjustments (e.g. preferred-partner multipliers from my order attributes) applied correctly, so that my final balance matches the trading preferences I set. |
| US-004 | P5 DSO representative | W (was Should) | As a DSO representative, I want grid-related fees to be correctly included in the billing calculation, so that network costs are properly accounted for without needing member-level personal data. *(Deprecated in v5.)* |
| US-005 | P6 Platform Operator | Must | As a platform operator, I want every billing run to produce an immutable, versioned record of how each balance was computed, so that any balance can be explained after the fact. |
| US-006 | P4 Community Manager | Must | As a community manager, I want to trigger or review a billing run for my pilot on a defined schedule (e.g. monthly), so that members are billed predictably. |
| US-037 | P1/P2/P3 Community member | Must | As a community member, I want to receive or access a clear PDF invoice showing the amount due or owed and its main components, so that I can understand the result of the billing calculation. |
| US-040 | P4 Community Manager | Must | As a community manager of a pilot where real invoicing is not yet permitted, I want the platform to compute and issue virtual bills and run payments in a test environment without moving real money, so that the pilot can evaluate P2P billing. |
| US-045 | P2 Consumer + P1 Prosumer | Must | As a consumer, I want to receive one invoice per producer I bought energy from in a period, netted with what I sold to them, so that I pay each producer exactly what I owe them. |

## Epic: ADMIN — Administrative management (GDPR)

| ID | Persona | Priority | Story |
|---|---|---|---|
| US-007 | P4 Community Manager | Must | As a community manager, I want to onboard a new member with their identity, location, and preferred payment method, so that they can be billed and paid correctly. |
| US-008 | P1/P2/P3 Community member | Must | As a community member, I want to view the personal and administrative information used for my billing and payment, so that I can identify inaccurate information and request its correction through my pilot/community administrator. |
| US-009 | P7 Compliance/DPO | Must | As a compliance stakeholder, I want personal data access restricted to the data's owner and authorized service roles only, so that the platform meets GDPR data-minimization requirements. |
| US-010 | P7 Compliance/DPO | Must | As a compliance stakeholder, I want a defined retention period after which personal data is deleted or anonymized, so that the platform doesn't retain data beyond its lawful purpose. |
| US-011 | P4 Community Manager | Should | As a community manager, I want to offboard a member (remove them from active billing) without losing the historical record needed for past disputes/audits, so that history stays intact while future processing stops. |
| US-012 | P7 Compliance/DPO | Should | As a compliance stakeholder, I want to export or confirm deletion of a specific participant's personal data on request, so that we can honor GDPR data-subject rights (access/erasure). |
| US-044 | P1/P2/P3/P4 Community member or manager | Must | As a community member or community manager, I want to review and accept the platform's terms of use before my billing is activated, so that I know the rules under which I am billed and paid. |

## Epic: FIAT — Fiat payments (Stripe)

| ID | Persona | Priority | Story |
|---|---|---|---|
| US-013 | P2 Consumer + P1 Prosumer | Must | As a community member, I want to pay an amount due using a supported fiat payment method, so that I can complete payment without needing to use a crypto wallet. |
| US-014 | P1 Prosumer | Must | As a prosumer, I want to receive payouts directly to my bank account when I'm owed money, so that I don't have to handle crypto to get paid. |
| US-015 | P6 Platform Operator | Must | As a platform operator, I want failed Stripe charges/payouts to be flagged automatically with a reason, so that I can follow up instead of discovering the failure from a member complaint. |
| US-016 | P2 Consumer + P1 Prosumer | Should | As a community member, I want to be notified when a charge succeeds or fails, so that I know the status of my payment without checking manually. |
| US-017 | P4 Community Manager | Should | As a community manager, I want an aggregated view of fiat payment status across all members for a billing period, so that I can see collection/payout completion at a glance. |
| US-039 | P6 Platform Operator | Must | As a Billing & Payment Platform Operator, I want the payment-provider onboarding required for payments and payouts to be integrated seamlessly into the platform flow, so that community members can use the fiat payment service with minimal additional steps. |
| US-046 | P1 Prosumer | Must | As a producer, I want the energy I sell to be invoiced in my name and paid directly to my account, so that I get paid without the platform holding my money. |
| US-047 | P2 Consumer | Should | As a consumer, I want to settle what I owe a producer before the end of the period, so that I can pay when it suits me. |

## Epic: CRYPTO — Crypto payments (wallets) — *deferred to D5.10*

| ID | Persona | Priority | Story |
|---|---|---|---|
| US-018 | P3 Participant using decentralised payment | W (was Must) | As a participant using decentralised payment, I want to connect my own wallet (MetaMask/Ledger/WalletConnect) to settle payments, so that I keep custody of my funds. |
| US-019 | P3 Participant using decentralised payment | W (was Should) | As a participant using decentralised payment without a self-custody wallet, I want the option of a custodial/embedded wallet (e.g. via DFNS), so that I can still use crypto rails without managing keys myself. |
| US-020 | P3 Participant using decentralised payment | W (was Must) | As a participant using decentralised payment, I want clear confirmation of my transaction (hash, number of confirmations), so that I can verify settlement independently on-chain. |
| US-021 | P6 Platform Operator | W (was Must) | As a platform operator, I want a transaction that fails or stalls on-chain to be clearly flagged with its last known status, so that it doesn't appear as silently pending forever. |

## Epic: AMM — AMM interface (T5.4) — *deprecated for D5.5, to be reassessed for D5.10*

| ID | Persona | Priority | Story |
|---|---|---|---|
| US-022 | P3 Participant using decentralised payment | W (was Should) | As a participant using decentralised payment, I want to swap energy tokens for i-Euro (or vice versa) through the AMM when it's more efficient than a direct settlement, so that I get better execution. |
| US-023 | P6 Platform Operator | W (was Must) | As a platform operator, I want the system to verify a buyer holds sufficient collateral before executing an AMM swap on their behalf, so that a seller is never left unpaid after a swap. |
| US-024 | P3 Participant using decentralised payment | W (was Could) | As a participant using decentralised payment, I want to see the AMM's quoted price before confirming a swap, so that I can decide whether to proceed. |

## Epic: STABLE — Stablecoin (i-Euro) — *deferred to D5.10*

| ID | Persona | Priority | Story |
|---|---|---|---|
| US-025 | P3 Participant using decentralised payment | W (was Should) | As a participant using decentralised payment, I want to convert my balance into i-Euro, so that I can transact on the platform using a Euro-pegged asset instead of a volatile token. |
| US-026 | P6 Platform Operator | W (was Should) | As a platform operator, I want i-Euro balance movements to be tracked with the same auditability as fiat and other crypto payments, so that reconciliation is consistent across all rails. |

## Epic: OPS — Platform operations & traceability

| ID | Persona | Priority | Story |
|---|---|---|---|
| US-027 | P6 Platform Operator | Must | As a platform operator, I want to trace any payment back to the exact trade(s) and balance calculation that produced it, so that I can answer "why was I charged/paid this?" with evidence. |
| US-028 | P6 Platform Operator | Must | As a platform operator, I want the GSY DEX and EWDS data ingestion to alert me if it stops receiving expected data, so that a silent integration failure doesn't go unnoticed. |
| US-029 | P7 Compliance/DPO | Must | As a compliance stakeholder, I want an audit log of who accessed or modified a participant's payment/personal data and when, so that access is accountable. |
| US-038 | P6 Platform Operator | Must | As a platform operator, I want to reconcile calculated balances with payment and payout results, so that discrepancies or incomplete settlements can be detected and investigated. |
| US-042 | P6 Platform Operator | Must | As a platform operator, I want the billing service to produce the data required for the project KPIs, so that WP6 can evaluate the service. |

## Epic: REPORT — Reporting & dispute resolution

| ID | Persona | Priority | Story |
|---|---|---|---|
| US-030 | P4 Community Manager | Must | As a community manager, I want to look up a specific member's full billing/payment history when they raise a dispute, so that I can resolve it with evidence rather than guesswork. |
| US-031 | P4 Community Manager | Should | As a community manager, I want a periodic summary report (billed, collected, paid out, failed) for my pilot, so that I can monitor billing and payment reconciliation. |
| US-041 | P4 Community Manager | Should | As a community manager, I want to update an invoice's payment status manually with a reason when a payment was settled outside the platform, so that the billing status stays accurate. |

---

## Coverage check

- Every functional area of the Grant Agreement's T5.6 description in scope for D5.5 (billing calculation, administrative management, fiat payments) has at least one **Must** story above. Crypto payments and stablecoin are deferred to D5.10; the AMM interface is deprecated for D5.5. Their stories are kept at priority **W**.
- Cross-cutting concerns (identity, GDPR, traceability/audit, reconciliation, operational monitoring) are captured under AUTH, ADMIN and OPS rather than left implicit.

## Open review points

- **R-1 (US-036 / REQ-038)**: closed in v4 — deprecated.

*Next: see `requirements.md`, where each story above is translated into one or more testable requirements.*
