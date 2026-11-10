# Manual S1 portal journey (prod-shaped path)

> **Cahier démo principal (tous personas + tous écrans en images) :**  
> [`cahier-de-tests-demo-intelligent-billing-and-payment.md`](./cahier-de-tests-demo-intelligent-billing-and-payment.md)  
> Index : [`docs/testing/README.md`](./README.md). Product name: **Intelligent Billing & Payment**.

**Status:** Ready on `dev` after INT-235…INT-241.  
**Audience:** Tester / product / operator walking the UI end-to-end.  
**Mode:** Fully manual — **no** kubectl, **no** `stripe-fresh-billing-run.mjs` for the happy path.  
**Environment:** Stripe **test mode** only (BR-12).

Related: `docs/testing/stripe-connect-test-kyc.md`, `docs/testing/uat028-operator-trace.md`.

---

## 0. Entry points

| Surface | URL |
|---|---|
| Web app | https://app.dev.intelligent-eu-bp.blooo.dev |
| How to sign in | Open app → **Sign in with IdP** → Keycloak realm `int` |
| Password (all S1 / UAT fixtures) | `Intelligent-UAT-2026!` |

If login fails with wrong password / missing user, ask an operator to run `scripts/keycloak-ensure-uat-users.mjs` once against the live realm (not part of this script).

---

## 1. Accounts (S1 community)

**Community id** (billing tenancy — not a user):  
`c0ffee00-1234-4abc-8def-0123456789ab`

This UUID identifies the energy community for which billing is run. Community
settings, participants, trades and billing runs are all scoped to it. It appears
in the app header and on manager screens (e.g. Billing runs) so you can confirm
you are operating on the S1 demo community. Members (`lea.martin`, producers)
do **not** see manager menus after INT-243.

| Step | Username | Realm role | Purpose |
|---|---|---|---|
| 1–2 | `thomas.bernard` | member | Connect KYC (seller A) |
| 1–2 | `claire.dubois` | member | Connect KYC (seller B) |
| 3 | `marie.leroy` | manager | Start billing run (REQ-006) |
| 4 | `lea.martin` | member | Save card + view / PDF / **Pay** |

Participant ids (for operator trace only; do not type these in the UI):

| Actor | participantId |
|---|---|
| Consumer | `11111111-2222-4333-8444-555555555555` |
| Producer A | `66666666-7777-4888-9999-aaaaaaaaaaaa` |
| Producer B | `bbbbbbbb-cccc-4ddd-8eee-ffffffffffff` |
| Manager | `dddddddd-eeee-4fff-8000-111111111111` |

Fixture trades that the early run should settle (appear as `tradeIds` on invoices):

| tradeId | Pair | Rough amount |
|---|---|---|
| `0x8f3a1c2b4d5e6f708192a3b4c5d6e7f8` | consumer → A | ~€2.00 (10 kWh × €0.20) |
| `0x1a2b3c4d5e6f708192a3b4c5d6e7f809` | consumer → B | ~€2.64 (12 kWh × €0.22) |

---

## 2. Script — step by step

Use a private / incognito window per role (or **Sign out** between users).

### Step 1 — Producer A KYC

1. Open https://app.dev.intelligent-eu-bp.blooo.dev  
2. **Sign in with IdP**  
   - Username: `thomas.bernard`  
   - Password: `Intelligent-UAT-2026!`  
3. Go to **Payment setup** (`/payment-setup`).  
4. Click **Start payment setup**.  
5. Fill the producer KYC form (Stripe Connect **test** tokens — INT-195):

| Field | Value to enter |
|---|---|
| Business type | `Individual` |
| Business profile URL | `https://accessible.stripe.com` |
| MCC | `5734` (often prefilled) |
| First name | `Thomas` |
| Last name | `Bernard` |
| Email | `thomas.bernard@example.invalid` |
| Phone | `+33600000000` (optional) |
| DOB day / month / year | `1` / `1` / `1902` (often prefilled) |
| Address | `address_full_match` (often prefilled) |
| City | `Paris` |
| Postal code | `75002` |
| Country | `FR` |
| Identity document file id | `file_identity_document_success` |
| Bank currency | `eur` |
| Bank account (IBAN) | `FR1420041010050500013M02606` |
| Stripe Connected Account Agreement | **checked** |

6. Submit (button label: submit KYC / submit requirements).  
7. **Checks**  
   - [ ] Alert or status shows payment account / onboarding progressing or **Payment account ready**  
   - [ ] No red API error toast  
   - [ ] If still “pending”, wait 30–60 s and refresh the page once (Stripe test KYC settle)  
8. **Sign out**.

### Step 2 — Producer B KYC

Repeat Step 1 with:

| Field | Value |
|---|---|
| Username | `claire.dubois` |
| First name / Last name | `Claire` / `Dubois` |
| Email | `claire.dubois@example.invalid` |
| Same Stripe test tokens and IBAN as Step 1 |

**Checks**

- [ ] Same success criteria as Producer A  
- [ ] **Sign out**

### Step 3 — Manager starts an early billing run

1. Sign in as `marie.leroy` / `Intelligent-UAT-2026!`  
2. Open **Billing runs** (`/billing-runs`).  
3. **Checks before start**  
   - [ ] Page title **Billing runs**  
   - [ ] Community shows `c0ffee00-1234-4abc-8def-0123456789ab`  
4. Under **Start a run**:  
   - Type: **Early** (Radio)  
   - Period: leave empty (not required for Early)  
5. Click **Start run**.  
6. **Checks**  
   - [ ] **Run status** card appears with a `runId` (UUID)  
   - [ ] Status **completed** (sync run)  
   - [ ] Optional: click **Refresh** — still completed  
7. Note the `runId` for later trace (optional).  
8. **Sign out**.

If the run completes with **no invoices** later (Step 4 empty): fixture trades were already marked billed by a previous demo. Ask an operator to clear billed marks once (`POST …/internal/v1/fixture-billed:reset`), then repeat Step 3. That reset is **not** a normal product control — V1 fixture only.

### Step 4 — Consumer pays

1. Sign in as `lea.martin` / `Intelligent-UAT-2026!`  
2. Open **Payment setup** → **Start payment setup**.  
3. Consumer Stripe Payment Element — enter test card:

| Field | Value |
|---|---|
| Card number | `4242 4242 4242 4242` |
| Expiry | any future date (e.g. `12/34`) |
| CVC | any 3 digits (e.g. `123`) |
| Postal / name | any if asked |

4. Save payment method.  
5. **Checks**  
   - [ ] Payment method / account ready (or wizard advances)  
6. Open **Invoices** (`/invoices`).  
7. **Checks (list)**  
   - [ ] At least **two** invoices (one per producer pair)  
   - [ ] Status **Open** (or one Open if the other already paid)  
   - [ ] Totals roughly **2.00** and **2.64** EUR (early run; exact cents may vary with carry)  
8. Click **View** on the first Open invoice.  
9. **Checks (detail)**  
   - [ ] Energy / VAT / Total visible  
   - [ ] Text **no grid-fee lines** (A20 / REQ-007)  
   - [ ] `tradeIds` include `0x8f3a…` or `0x1a2b…` when shown  
10. Click **Open PDF**.  
11. **Checks**  
    - [ ] New tab / popup opens (Stripe hosted invoice or PDF)  
    - [ ] Close the tab  
12. Click **Pay** (enabled only when status is Open).  
13. **Checks**  
    - [ ] Success / status moves toward **Paid** (or clear payment confirmation)  
    - [ ] **Pay** disabled after Paid  
14. Repeat View / PDF / Pay for the second Open invoice if present.  
15. **Sign out**.

---

## 3. Optional checks (same session or Stripe Dashboard)

| Check | How |
|---|---|
| Producer sees own invoices | Login `thomas.bernard` → `/invoices` → rows where they are seller |
| Balances empty after pay | `lea.martin` → `/balances` → no outstanding or reduced |
| Stripe Dashboard (test) | Connect accounts + Customers + Invoices created for the run |
| Trace REQ-028 | From invoice detail: `tradeIds` + `pairSettlementId`; manager/operator can correlate to `runId` |

---

## 4. Pass / fail summary

**Pass** when all of the following hold:

1. Both producers complete KYC without blocking errors.  
2. Manager Early **Start run** returns **completed** for community `c0ffee00…`.  
3. Consumer sees Open invoices, opens PDF, pays at least one to **Paid**.  
4. No grid fees on the invoice detail.  
5. No personal data beyond profile fields required by the forms (identifiers in events stay ids-only — NFR).

**Fail** examples:

- Manager community is `a1000000…` → wrong user (`sofia.garcia`); use `marie.leroy`.  
- Invoices never appear after a completed run → producers not `charges_enabled` yet (wait / re-submit KYC) or trades already billed (operator reset once).  
- Pay disabled forever on Open → consumer payment method missing (redo Step 4 card setup).

---

## 5. Out of scope for this script

- UAT community (`hugo.petit` / `sofia.garcia` / `paul.nguyen`) — separate portal UX path; seed invoice `UAT218-000001` is **Paid** and does not exercise S1 market → NATS → Pay.  
- Operator CLI smoke (`stripe-fresh-billing-run.mjs`) — alternative for fresh Connect accounts every run; not required here.  
- Live Stripe / production KYC documents.
