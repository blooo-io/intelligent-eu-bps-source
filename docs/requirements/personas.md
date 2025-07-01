# Personas — Billing & Payment Service (T5.6 / D5.5)

Status: draft v2 (review comments integrated, 2026-09-24), derived from the Grant Agreement, the four pilots (LIC, CELL, Aran Islands, Greenvolt), and the WP3 ontology. To be validated/corrected with pilot partners before requirements are frozen. Summary item notes (for traceability links): `items/personas/P1.md` … `P7.md`.

These personas represent the people and roles who interact with the Billing & Payment Service, directly or indirectly. Every user story in `user-stories.md` is written from the point of view of one of these personas.

---

## P1 — Prosumer (energy-sharing community member with generation)

**Who**: a Local Energy Community (LEC) member, individual or organisation, who both produces (e.g. rooftop PV) and consumes energy, and trades surplus/deficit on the GSY DEX market. Present in all four pilots.

**Goals**:
- Understand exactly what they owe or are owed at the end of a billing period.
- Get paid promptly and reliably for energy sold to peers.
- Receive a reliable and clearly traceable settlement or payout when the resulting balance is positive.
- Choose a payment method that suits them (bank transfer/card via Stripe, or crypto wallet).
- Trust that the calculation is correct and traceable back to their actual trades.

**Pain points / concerns**:
- Not technical — a blockchain-native flow (gas fees, wallet signing) can be confusing or intimidating.
- Wants a simple, transparent bill, not a raw list of on-chain transactions.
- Needs a clear payment or payout status and understandable information when a transaction fails or is delayed.

**Relationship to the service**: primary end-user of billing statements. May either make a payment or receive a payout depending on the resulting balance.

---

## P2 — Consumer-only member (no generation)

**Who**: an LEC member who only consumes energy (no local generation), buying from the community pool.

**Goals**:
- Pay the correct amount and clearly understand how the billed amount has been calculated.
- Pay via a familiar method (card, direct debit) without needing a crypto wallet.
- See billing history and understand any grid fees or tariff components included.

**Pain points / concerns**:
- Least likely to want to deal with crypto/wallets at all — fiat-only path must be first-class, not an afterthought.
- Needs clear, non-technical language on any statement or notification (information on bills, payment status and errors).

**Relationship to the service**: charged party in most billing cycles; primarily uses the fiat rail.

---

## P3 — Participant using decentralised payment

**Who**: a prosumer or consumer who uses the decentralised payment option if and when this functionality is implemented within T5.6, using a supported crypto wallet and token-based settlement mechanism.

**Goals**:
- Use a supported crypto wallet to complete decentralised settlement where applicable.
- Complete settlement through the AMM/token-based mechanisms defined by the relevant WP5 components.
- Access sufficient transaction information to verify the status and traceability of a decentralised payment.

**Pain points / concerns**:
- Needs enough collateral guarantees before a swap executes — doesn't want a counterparty risk.
- Wants clear confirmation (transaction hash, block confirmations) rather than only an in-app status.
- Should not have to understand unnecessary blockchain implementation details to complete the payment flow.

**Relationship to the service**: primary user of the crypto payment module, the stablecoin module, and the AMM interface module (all out of scope for D5.5 — see `user-stories.md`).

---

## P4 — Community Manager / Pilot Operator

**Who**: an organisation or authorised representative responsible for operating the local energy community or pilot. This role manages member onboarding and offboarding, maintains the administrative information required by the Billing & Payment Service, and oversees billing and payment operations at community level.

**Goals**:
- Onboard/offboard community members and keep their administrative data (identity, location, payment method) accurate and compliant.
- Get a clear, aggregated view of billing runs: who was billed, who was paid, what failed and why.
- Resolve disputes (a member questions their bill) with enough traceability to answer confidently.
- Ensure the community's economics balance (fees collected vs. payouts made).

**Pain points / concerns**:
- Not a payments or blockchain expert — needs an operational dashboard/report, not raw ledger data.
- Accountable to members for fairness and correctness of billing.
- Needs clear visibility on failures, inconsistencies or missing data that could affect billing.
- Needs to coordinate with the DSO on grid-related components of the tariff.

**Relationship to the service**: primary consumer of the administrative management module and of billing/payment reporting; escalation point for member issues.

**Working assumption**: for the purpose of the T5.6 functional design, pilot administrators/community managers are assumed to be responsible for user identity, onboarding and the provision of the administrative data required by the Billing & Payment Service. This assumption remains subject to consortium validation.

---

## P5 — Grid Operator / DSO representative

**Who**: the Distribution System Operator relevant to a pilot — e.g. E-Redes (PT). Responsible for providing or validating grid-related tariff and fee information that may affect billing and settlement calculations.

**Goals**:
- Provide or validate the tariff and grid-fee information required.
- Access aggregated, non-personal settlement data relevant to grid operation, without needing member-level personal data.

**Pain points / concerns**:
- Must not receive personal data beyond what is strictly necessary (GDPR, data minimisation).
- Indirect stakeholder — does not use the service daily, but its correctness affects DSO settlement.

**Relationship to the service**: consumes aggregated/derived data only; not a direct user of billing or payment modules.

---

## P6 — Billing & Payment Platform Operator

**Who**: an authorised technical operator responsible for operating, monitoring and supporting the Billing & Payment Service and its integrations with external INTELLIGENT components and payment services.

**Goals**:
- Monitor billing runs and payment executions (fiat, crypto, AMM, stablecoin) for failures or anomalies.
- Investigate and resolve a specific participant's payment issue quickly, using full traceability (trade → balance → payment → status).
- Ensure GSY DEX and EWDS integrations stay healthy (data ingestion not silently failing).
- Demonstrate compliance (GDPR, auditability, open-source licensing) ahead of the D5.5 public release.

**Pain points / concerns**:
- Operates a service processing sensitive billing and participant information, where silent failures could lead to incorrect bills, payments or validation results.
- Needs strong observability and an audit trail, not just a working happy path.
- Needs sufficient diagnostic information to investigate incidents without unnecessarily exposing participants' personal data.

**Relationship to the service**: operates and administers the whole system; primary user of internal admin/monitoring tooling (not necessarily part of the public-facing scope, but a source of non-functional requirements).

---

## P7 — Compliance / Data Protection stakeholder

**Who**: a stakeholder responsible for reviewing the Billing & Payment Service from a data protection and compliance perspective. This role is used to represent T5.6 GDPR and auditability requirements and does not imply that a dedicated DPO exists within the INTELLIGENT project.

**Goals**:
- Confirm personal data (identity, location, payment details) is collected, stored, and retained lawfully.
- Verify that personal data required by the Billing & Payment Service is limited to what is necessary for billing, payment and related administrative operations.
- Verify that personal data received from pilot/community administrators and exchanged with external services is handled appropriately.
- Ensure that access to personal, billing and payment information is restricted according to user roles and operational needs.
- Be able to produce an audit trail for any transaction or balance on request.
- Confirm the eventual open-source GitHub publication (D5.5, PU) contains no personal or sensitive data.

**Pain points / concerns**:
- Needs the personal-data subset of the data model to be cleanly separated and governable (cf. `ARCHITECTURE.md` §5–7).
- Needs assurance before go-live, not after an incident.

**Relationship to the service**: does not use the service operationally but sets constraints that every other persona's stories must satisfy (data minimisation, retention, auditability).

---

## Persona summary table

| ID | Persona | Primary interest | Primary module(s) |
|---|---|---|---|
| P1 | Prosumer | Get paid correctly and promptly | Billing engine, fiat + crypto payment |
| P2 | Consumer-only member | Pay correctly, simply | Billing engine, fiat payment |
| P3 | Participant using decentralised payment | Self-custody settlement, AMM/stablecoin | Crypto payment, AMM interface, stablecoin (out of D5.5 scope) |
| P4 | Community Manager / Pilot Operator | Operational oversight, dispute resolution | Administrative management, reporting |
| P5 | Grid Operator / DSO representative | Correct network-aware tariff data | Billing engine (aggregated output only) |
| P6 | Billing & Payment Platform Operator | System health, traceability | All modules (ops view) |
| P7 | Compliance / DPO stakeholder | GDPR & audit compliance | Administrative management, audit trail |

*Next: see `user-stories.md` for the user stories written against each of these personas.*
