# V1 integration scenarios — preparation (INT-74)

Scenarios **S1–S13** are defined in [`docs/architecture/03-application-architecture.md`](../architecture/03-application-architecture.md) §8. Datasets live in `@intelligent/mocks` (`loadScenario` / `createMockSuite`). This note prepares the cases and the environment for execution under **INT-75**. It does **not** copy UAT Given/When/Then text — those stay in `docs/requirements/items/uat/`.

## Environment

| Target | When to use | How |
|---|---|---|
| **Local** (`local`) | Laptop iteration of a single scenario | `node scripts/local-stack.mjs --up`, then `tilt up`; Stripe CLI: `stripe listen --forward-to localhost:8080/webhooks/payment-provider` (see `deploy/README.md`) |
| **int / `dev`** | Shared cluster acceptance (GitOps) | Cluster `k8s-intelligent-eu-dev`, namespaces `int-apps` / `int-data`; hosts under `*.intelligent-eu-bp.blooo.dev`; adapters selected by config (mocks + Stripe test) |

Both targets run in **virtual mode with Stripe test** (assumption A32 / PD-2). GSY DEX, EWDS and ECB are never live in V1 — they go through AC-15 mocks. Mail is Mailpit, not a real SMTP provider.

### Preconditions (every scenario)

1. Participants and community identifiers match the fixture UUIDs in `mocks/src/scenarios/registry.ts` (no personal data).
2. Community billing settings exist (threshold, currency, VAT) for the scenario under test.
3. Module adapters are on mock/fixture implementations except Stripe (test mode keys from OpenBao / local env).
4. For payment scenarios (S10): Stripe test mode + CLI webhook forwarder (local) or cluster webhook route to payments.
5. For publication (S13): EWDS schemas under `docs/architecture/ewds-topics/` (also mirrored in `mocks/schemas/`).

### Fixture identifiers (shared)

| Role | UUID |
|---|---|
| Community | `c0ffee00-1234-4abc-8def-0123456789ab` |
| Consumer | `11111111-2222-4333-8444-555555555555` |
| Producer A | `66666666-7777-4888-9999-aaaaaaaaaaaa` |
| Producer B | `bbbbbbbb-cccc-4ddd-8eee-ffffffffffff` |
| Unknown party | `00000000-0000-4000-8000-000000000099` |
| Period | `2026-11-01T00:00:00Z` → `2026-11-02T00:00:00Z` |

## Case matrix

| Scenario | Requirement | UAT | Primary modules | Fixture focus | Expected outcome (integration) |
|---|---|---|---|---|---|
| S1 | REQ-054 | UAT-071 | trade-intake → settlement → invoicing | Consumer buys from 2 producers | Two invoices (one per producer pair) |
| S2 | REQ-055 | UAT-072 | settlement → invoicing | Two-way prosumer trades | One netted invoice for the pair |
| S3 | REQ-056 | UAT-073 | settlement | Amount under threshold | Carry-forward; no invoice this period |
| S4 | REQ-058 | UAT-075 | trade-intake | `unknownParty` seller | Trade flagged; not invoiced |
| S5 | REQ-041 | UAT-052 | reconciliation | Clearing count ≠ trade feed | Discrepancy recorded |
| S6 | REQ-001 | UAT-001 | trade-intake → scheduler | `lateArrival` after run | Billed on the next run only |
| S7 | REQ-001 | UAT-001 | trade-intake | Duplicate `tradeId` | Settled/billed once (idempotent) |
| S8 | REQ-002 | UAT-002 | reference-data → settlement → invoicing | CHF community + ECB fixture | Invoice amount uses fixture FX rate |
| S9 | REQ-057 | UAT-074 | settlement → invoicing | `settlementType: early` | Mid-period settlement produces invoice |
| S10 | REQ-016, REQ-046 | UAT-016, UAT-057 | payments | Stripe test cards (below) | Failures categorized; retry/status path exercised |
| S11 | REQ-045 | UAT-056 | invoicing | `producersWithoutKyc` | Invoice held until KYC |
| S12 | REQ-013 | UAT-013 | compliance (+ IdP / PSP erase ports) | `erasureRequest` | Propagation recorded; invoices retained |
| S13 | REQ-048 | UAT-070 | publication | Empty trade set; schema check | Published payloads validate against `billingInvoice` / `billingPayment` |

### S10 Stripe test cards (from the mock suite)

| Card number | Outcome |
|---|---|
| `4000000000000002` | declined |
| `4000000000009995` | insufficient_funds |
| `4000002500003155` | authentication_required |

Payments may also force failures via payment-method id prefix `pm_fail_` on the mock PSP adapter when not hitting live Stripe test.

## Automated coverage already in place

These are **component / module** tests that load AC-15 fixtures. They do not replace the INT-75 end-to-end run, but they prove the datasets and primary rules.

| Scenario | Where covered today |
|---|---|
| S1–S13 registry + port behaviour | `mocks/src/scenarios.spec.ts`, `mocks/src/ports.spec.ts` |
| S1 (pairs) | `services/settlement` (service + netting + HTTP smoke), `services/trade-intake` |
| S2 / S3 / S8 | `services/settlement` fixture scenarios |
| S4 / S7 | `services/trade-intake` |
| S5 | `services/reconciliation` |
| S10 | `services/payments` (failure categories) |
| S12 | `services/compliance` |

Gaps for INT-75: full path across modules on local or `dev` for each row in the case matrix, with UAT note updates (`status`, `last_run`, `tester`, run note).

## Execution hand-off (INT-75)

For each scenario:

1. Select environment (prefer `dev` for shared evidence; local for debugging).
2. Load or seed the scenario dataset (`createMockSuite("Sn")` or equivalent config).
3. Run the billing / payment / compliance path required by the case matrix.
4. Assert the expected outcome against the linked UAT note.
5. Update that UAT note status in the same change that records the run.
6. Record defects on INT-75 / INT-82; do not invent new UAT IDs.

## Evidence layout

- UAT results: `docs/requirements/items/uat/UAT-xxx.md`
- Unit/component coverage gate: [`v1-unit-component-evidence.md`](v1-unit-component-evidence.md) (INT-73)
- This preparation note: INT-74
- Execution log / defects: INT-75
