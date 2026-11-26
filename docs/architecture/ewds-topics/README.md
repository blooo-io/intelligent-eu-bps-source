# Billing EWDS topics: draft proposal from Blooo to EWAG

Status: **DRAFT v0.4 (2026-11-26, INT-447)**, proposed by Blooo (T5.6 / D5.5) for review by EWAG.
Agreement: EWAG creates the topics; Blooo proposes the JSON schemas. Actor and Tariff schemas are **to submit to EWAG**.
Project path is **EWDS-only**: R2M publishes `actor` create/update (CSV in R2M = N Actor messages); billing commands include `acceptTerms`; no billing-service CSV fallback.

## Topics

| Topic | Version | Proposed owner | Publisher | Expected subscribers | Schema |
|---|---|---|---|---|---|
| `billingStatement` | 1.0.0 | `integration.apps.intelligent.auth.ewc` | Billing & Payment Service (Blooo gateway) | GSY Analytics / WP6 (KPIs), project UI (R2M) | `billingStatement.v1.0.0.schema.json` |
| `billingInvoice` | 1.0.0 | `integration.apps.intelligent.auth.ewc` | Billing & Payment Service (Blooo gateway) | GSY DEX (trade payment status), GSY Analytics / WP6 (KPIs), project UI (R2M) | `billingInvoice.v1.0.0.schema.json` |
| `billingPayment` | 1.0.0 | `integration.apps.intelligent.auth.ewc` | Billing & Payment Service (Blooo gateway) | same | `billingPayment.v1.0.0.schema.json` |
| `billingPayout` | 1.0.0 | `integration.apps.intelligent.auth.ewc` | Billing & Payment Service (Blooo gateway) | project UI (R2M) | `billingPayout.v1.0.0.schema.json` |
| `billingKycStatus` | 1.0.0 | `integration.apps.intelligent.auth.ewc` | Billing & Payment Service (Blooo gateway) | project UI (R2M) | `billingKycStatus.v1.0.0.schema.json` |
| `billingCommandRequest` | 1.0.0 | `integration.apps.intelligent.auth.ewc` | project UI gateway (subscriber) | Billing & Payment Service (poller) | `billingCommandRequest.v1.0.0.schema.json` |
| `billingCommandReply` | 1.0.0 | `integration.apps.intelligent.auth.ewc` | Billing & Payment Service (Blooo gateway) | project UI gateway (correlated reply) | `billingCommandReply.v1.0.0.schema.json` |
| `actor` | 1.0.0 | `integration.apps.intelligent.auth.ewc` | Project UI (R2M) / consortium Actor source | Billing & Payment Service (`ActorSourcePort` — intake only) | `actor.v1.0.0.schema.json` |
| `tariff` | 1.0.0 | `integration.apps.intelligent.auth.ewc` | Blooo (Tariff class owner) | Billing & Payment Service (`TariffPort`) | `tariff.v1.0.0.schema.json` |

Proposed channels (Blooo gateway DID `did:web:blooo.intelligent` — confirm with EWAG):

| Channel | Direction (billing view) | Payload topics |
|---|---|---|
| `blooo.intelligent.billing.pub` | publish | `billingStatement`, `billingInvoice`, `billingPayment`, `billingPayout`, `billingKycStatus` |
| `blooo.intelligent.billing.commands.sub` | receive | `billingCommandRequest` |
| `blooo.intelligent.billing.replies.pub` | publish (reply) | `billingCommandReply` (CGW `transactionId` = `requestId`) |

Subscribe channels are restricted by role to the consortium application.

## When messages are published
- **billingStatement:** on statement issue and on every status change (two-level model, REQ-059).
- **billingInvoice:** on every invoice creation and status change (Open → PartiallyPaid / Paid / Overdue / Void / Disputed).
- **billingPayment:** on every payment status change (pending → succeeded / failed / cancelled / refunded).
- **billingPayout:** on payout request and on every payout status change.
- **billingKycStatus:** when Connect account or Stripe Identity verification status changes for a participant.
- **billingCommandRequest / Reply:** request/reply on the command channel (REQ-052, A7). The project UI never calls Blooo REST directly; `/v1` is the reference-client API (`apps/web`) only.

### Command authorization (three layers)

1. **CGW channel restriction** on `blooo.intelligent.billing.commands.sub` (UI gateway DID or project role, configured with EWAG).
2. **Sender check:** `senderDid ∈ EWDS_COMMAND_ALLOWED_DIDS` **and** signature valid.
3. **Actor role** for the asserted `actorId` per command (participants authorization).

Subscribers should treat primary ids as idempotency keys and keep the latest `updatedAt`.

## Billing model reflected in the schemas
- **Two levels:** monthly participant **Billing** (`billingStatement`, ontology fields `billingId` / `billingStatus`) and legal **pair invoice** (`billingInvoice`) per consumer→producer period.
- `billingInvoice.billingId` is the consumer's Billing/statement id (not the pair-settlement id); `issuerStatementId` is the producer's Billing/statement id for the same period.
- `invoiceIssuedBy` = producer Actor; `invoiceIssuedTo` = consumer Actor (self-billing).
- Early settlement is removed (`settlementType` = `periodic` | `final` only). **`billingMode`** is per community (virtual test or live Stripe keys).
- The invoice is issued by the platform **in the name of the producer** (self-billing).
- Payment goes directly from the consumer to the producer's Connect account (direct charge, REQ-014).
- **Command handoffs (A7-bis):** `startPayment`, `startKyc` and `setupPaymentMethod` accept `surface: hosted | embedded`. Replies carry a **PspHandoff** — either a Stripe-hosted URL (`checkout.stripe.com`, `connect.stripe.com`, `verify.stripe.com`) or embedded `clientSecret` + `publishableKey` (+ optional `connectedAccountRef`). Never a Blooo URL.
- **Trade status is not changed by billing.** `settled` keeps the GSY DEX meaning.

## Actor and Tariff (to submit to EWAG)
- **`actor`:** ontology Actor / Address / ContactDetails. **R2M is the sole project-path publisher** for create and update (including CSV→N messages). BPS only ingests (`ActorSourcePort`). KYC fields (`taxId`, `dateOfBirth`, `ownershipPercentage`, `nationality`, `isBeneficialOwner`, `isControlPerson`) never travel on EWDS (ADR-013) — omitted from the schema. Address uses `line1` (not `street`).
- **`tariff`:** ontology Tariff owned by Blooo (`tariffId`, `communityId`, `gridId`, currency, validity, energyPrice, networkTariff, levies, taxes, incentives, structure `flat`|`TOU`). Proposed for EWAG registration.

## Personal data
Billing topics carry no personal data (names, e-mail, IBAN, card data, Stripe ids) — parties are Actor UUIDs only. The `actor` topic may carry contact and address needed for operations; KYC-sensitive fields stay PSP-side (ADR-013).

## Validation done by Blooo
- JSON Schema 2020-12; `additionalProperties: false` on every topic.
- Example payloads (`*.example.json`) validate in CI (`pnpm contracts:ewds`).
- Negative fixtures under `fixtures/invalid/` must fail validation (NFR-004).

## Open points for EWAG
1. Confirm the topic owner namespace and the channel names / role restrictions.
2. JSON Schema 2020-12 (repo convention) or draft-07 (Client Gateway "JSD7"): both work, so tell us which one to register.
3. Should ontology `Invoice.json` / `Payment.json` be extended the same way (minor version), or should these topics stay billing-specific?
4. Trade id format: should `Trade.tradeId` (`format: uuid`) be aligned with the GSY DEX v2 bytes16 ids?
5. **Command channel role restriction:** which VC roles may subscribe to `commands.sub` and receive on `replies.pub`?
6. Confirm registration of Blooo-owned **`actor`** and **`tariff`** topics (schemas in this folder — to submit to EWAG). Erasure remains adapter-only.