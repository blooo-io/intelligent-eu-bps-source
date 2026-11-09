# Stripe Connect test KYC (INT-195 / UAT-015)

V1 uses **Stripe test mode only** (BR-12). Custom Connect accounts created with Account Tokens (INT-191) can stick at `verification_failed_keyed_identity` unless the KYC payload uses Stripe’s [Connect testing](https://docs.stripe.com/connect/testing) magic values.

## Magic values (test mode)

| Field | Value | Effect |
|---|---|---|
| `individual.dob` | `1902-01-01` | Immediate successful DOB match |
| `individual.address.line1` | `address_full_match` | Successful address match (use a real city / postal_code) |
| `individual.verification.document.front` | `file_identity_document_success` | Satisfies identity document requirement |
| `individual.verification.additional_document.front` | `file_identity_document_success` | Satisfies additional document alternative |

Without the document file tokens, keyed identity failures leave `charges_enabled=false` and direct charges on the producer account / payouts are blocked (UAT-015). Since INT-355, AC-07 pays the producer's Stripe invoice on the Connect account (direct charge); the 2026-10-18 evidence below predates that change and used a destination charge.

## Product path

Since INT-362 the portal no longer has a KYC form. The producer opens `/onboarding?step=payment` (or Payout account), AC-07 creates a Stripe-collected account (producer pays fees and bears disputes) and the Stripe embedded Account onboarding component collects everything. In test mode, enter the magic values above in that component (and Stripe's test phone / SMS code `000 000`). On exit the portal calls Start again and reads the status from Stripe.

## Operator fixture path (test mode only)

`POST /internal/v1/payment-accounts:provision` (seed scripts) keeps the INT-191 / INT-195 token path, because Stripe does not let the platform accept the terms of service of Stripe-collected accounts:

1. AC-07 builds an Account Token with DOB `1902-01-01`, address `address_full_match`, and identity file token `file_identity_document_success`.
2. AC-07 creates the Custom account; poll until `charges_enabled` / session `complete` or `pending_verification` clears.

## Live evidence (2026-10-18)

- Producer `acct_1URvtiF4LYz7qY6g`: `charges_enabled=true`, `payouts_enabled=true`.
- Destination PaymentIntent `pi_3URywTFDSWgmDDqh0b0TDGB5` → transfer `tr_3URywTFDSWgmDDqh0dyEaZEy`.
- Instant payout `po_1URyxLF4LYz7qY6gOhtNGoGy` → bank `ba_1URvtlF4LYz7qY6gb29488jq` (`status=paid`).
- Connect invoices `QAIDHPRM-0001` / `QAIDHPRM-0002` with PDF URLs (unblocks UAT-050 / UAT-053 Connect dependency).

## Operator notes

- Do **not** seed Stripe secrets or live PII into Git (INT-157 / secrets rules).
- Document file tokens are **test-mode only**; live mode requires a real upload via Stripe Files API with purpose `identity_document`.
