# mocks/ (AC-15)

Mock implementations of the external systems that are **not** integrated in V1 (A32 / INT-101). They are selected by configuration through the module adapters.

| Mock | Replaces | Used by |
|---|---|---|
| Market mock (`createMockMarket`) | GSY DEX request/reply over EWDS (`tradesQuery`, `clearingResultsQuery`, `marketsQuery`) | `trade-intake` |
| Data-space mock (`createMockDataSpace`) | EWDS Client Gateway; validates and records `billingInvoice` / `billingPayment` against `docs/architecture/ewds-topics/*.schema.json` | `publication` |
| FX fixture (`createFxFixture`) | ECB reference rates | `reference-data` |

**Scenario datasets S1–S13** (see 03 §8) are loaded with `loadScenario` / `createMockSuite`:

- pairs, netting and threshold (S1–S3);
- unknown party, incomplete market, late and duplicate trades (S4–S7);
- CHF communities and early settlement (S8–S9);
- payment failures, producer without KYC, erasure (S10–S12);
- schema validation (S13).

Stripe is **not** mocked: V1 uses Stripe test mode. Mail catcher is Mailpit (deploy chart), not this package.

```ts
import { createMockSuite } from "@intelligent/mocks";

const suite = createMockSuite("S1");
suite.market.queryTrades({ from: "…", until: "…" });
suite.fx.getRate("CHF", "2026-11-30");
suite.dataSpace.publish("billingInvoice", payload);
```
