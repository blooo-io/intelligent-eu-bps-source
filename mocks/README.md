# mocks/ (AC-15)

Mock implementations of the external systems that are **not** integrated in V1 (A32). They are selected by configuration through the module adapters.

| Mock | Replaces | Used by |
|---|---|---|
| Market mock | GSY DEX request/reply over EWDS (`tradesQuery`, `clearingResultsQuery`, `marketsQuery`) | `trade-intake` |
| Data-space mock | EWDS Client Gateway; validates and records `billingInvoice` / `billingPayment` | `publication` |
| FX fixture | ECB reference rates | `reference-data` |

**Scenario datasets S1–S13** (see 03 §8) cover:
- pairs, netting and threshold;
- unknown party, incomplete market, late and duplicate trades;
- CHF communities and early settlement;
- payment failures, producer without KYC, erasure;
- schema validation.

Stripe is **not** mocked: V1 uses Stripe test mode.
