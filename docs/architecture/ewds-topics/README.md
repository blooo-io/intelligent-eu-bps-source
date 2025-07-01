# Billing EWDS topics: draft proposal from Blooo to EWAG

Status: **DRAFT v0.1 (2026-10-07)**, proposed by Blooo (T5.6 / D5.5) for review by EWAG.
Agreement: EWAG creates the topics; Blooo proposes the JSON schemas.

## Topics

| Topic | Version | Proposed owner | Publisher | Expected subscribers | Schema |
|---|---|---|---|---|---|
| `billingInvoice` | 1.0.0 | `integration.apps.intelligent.auth.ewc` | Billing & Payment Service (Blooo gateway) | GSY DEX (trade payment status), GSY Analytics / WP6 (KPIs), project UI (R2M) | `billingInvoice.v1.0.0.schema.json` |
| `billingPayment` | 1.0.0 | `integration.apps.intelligent.auth.ewc` | Billing & Payment Service (Blooo gateway) | same | `billingPayment.v1.0.0.schema.json` |

Proposed channels: `blooo.intelligent.billing.pub` (publish, Blooo gateway DID). Subscribe channels are restricted by role to the consortium application.

## When messages are published
- **billingInvoice:**
  - on every invoice creation;
  - on every status change: Open → PartiallyPaid / Paid / Overdue / Void / Disputed.
  - The full record is re-published each time, with `updatedAt` changed.
- **billingPayment:** on every payment status change (pending → succeeded / failed / cancelled / refunded).

Subscribers should treat `invoiceId` / `paymentId` as idempotency keys and keep the latest `updatedAt`.

## Billing model reflected in the schemas
- One invoice covers the settled trades between **one consumer and one producer** for a billing period, an early settlement, or a forced final settlement.
- Purchases and sales between the two parties are netted.
- The invoice is issued by the platform **in the name of the producer** (self-billing).
- The payment goes directly from the consumer to the producer's payment-provider account.
- **Trade status is not changed by billing.** `settled` keeps the GSY DEX meaning (settled on-chain). Subscribers derive whether a trade is paid from `billingInvoice.tradeIds` combined with `invoiceStatus = Paid`.
- Trades of `billingMode = virtual` invoices are never paid with real money. All communities are virtual in D5.5 V1, with the payment provider in test mode.

## Differences from `schemas/v1.0.0/billing/Invoice.json` and `Payment.json`
Every addition is marked `[Extension]` in its description.

**billingInvoice**

| Change | Why |
|---|---|
| + `communityId`, `billingMode` (live/virtual), `settlementType` (periodic/early/final), `billingPeriodFrom/Until` | Per-community mode, early settlement, period traceability |
| + `selfBilling` | Invoice issued by the platform on behalf of the producer |
| + `totalEnergyKWh`, `vatRate`, `carriedForwardAmount`, `exchangeRate` | KPI EC-2 (cost per kWh), VAT transparency, minimum-threshold carry-forward, EUR→CHF conversion (ECB) |
| `gridFeeAmount` kept but constrained to 0 | Grid fees stay on the supplier/DSO bill in every pilot (assumption A20) |
| `tradeIds` required, and accepts UUID v4 **or** 16-byte hex `0x…` | GSY DEX v2 trade ids are bytes16 hex, not UUIDs |
| `invoiceIssuedBy` = producer Actor; `invoiceIssuedTo` = consumer Actor | Pair model |
| No legal invoice number | The legal number stays in billing and on the PDF; `invoiceId` is the shared identifier (May 2026 workshop) |
| `$id` uses `…/schema/v1.0.0/billing/…` | Follows the README convention (existing files use `…/ontology/…`) |

**billingPayment**

| Change | Why |
|---|---|
| + `communityId`, `billingMode`, `payerId`, `payeeId` | Lets subscribers attribute the payment without a join |
| + `failureCategory` (non-personal) | KPI UE-3 (payment error clarity) |
| − `stripeIds` | No payment-provider references on EWDS |
| `paymentProvider` limited to `stripe`, `currency` limited to ISO 4217 | No crypto in D5.5 (deferred to D5.10) |

## Personal data
Neither topic carries personal data:
- Parties are Actor UUIDs only.
- No name, address, e-mail, IBAN or payment-provider identifiers.
- No StripePayment record.

## Validation done by Blooo
- Both schemas pass the JSON Schema 2020-12 meta-schema.
- The example payloads (`*.example.json`) validate against them.
- Extra fields are rejected.
- A non-zero `gridFeeAmount` is rejected.
- Malformed trade ids are rejected.
- The same schemas also validate under **draft-07**, if the Client Gateway requires JSD7.

## Open points for EWAG
1. Confirm the topic owner namespace and the channel names / role restrictions.
2. JSON Schema 2020-12 (repo convention) or draft-07 (Client Gateway "JSD7"): both work, so tell us which one to register.
3. Should `Invoice.json` / `Payment.json` in the ontology be extended the same way (minor version), or should these topics stay billing-specific?
4. Trade id format: should `Trade.tradeId` (`format: uuid`) be aligned with the GSY DEX v2 bytes16 ids?
