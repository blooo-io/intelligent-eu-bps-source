# Billing EWDS topics: draft proposal from Blooo to EWAG

Status: **DRAFT v0.2 (2026-11-24, INT-423)**, proposed by Blooo (T5.6 / D5.5) for review by EWAG.
Agreement: EWAG creates the topics; Blooo proposes the JSON schemas.

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
- **Two levels:** monthly participant **statement** (`billingStatement`) and legal **pair invoice** (`billingInvoice`) per consumer→producer period.
- `billingInvoice.billingId` is the consumer's statement id; `issuerStatementId` is the producer's statement id for the same period.
- Early settlement is removed (`settlementType` = `periodic` | `final` only).
- The invoice is issued by the platform **in the name of the producer** (self-billing).
- Payment goes directly from the consumer to the producer's Connect account (direct charge, REQ-014).
- **Command handoffs (A7-bis):** `startPayment`, `startKyc` and `setupPaymentMethod` accept `surface: hosted | embedded`. Replies carry a **PspHandoff** — either a Stripe-hosted URL (`checkout.stripe.com`, `connect.stripe.com`, `verify.stripe.com`) or embedded `clientSecret` + `publishableKey` (+ optional `connectedAccountRef`). Never a Blooo URL.
- **Trade status is not changed by billing.** `settled` keeps the GSY DEX meaning.

## Personal data
No topic carries personal data (names, e-mail, IBAN, card data, Stripe ids). Parties are Actor UUIDs only.

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
6. **Actor, erasure and tariff topics** are owned by other gateways; billing only consumes them via adapters (documented separately).