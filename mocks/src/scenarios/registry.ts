/**
 * INT-101 — V1 scenario datasets S1–S13 (architecture 03 §8).
 * Identifiers only; no personal data (NFR-015).
 */
import type { ScenarioDataset, ScenarioId } from "../types.js";

const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";
const CONSUMER = "11111111-2222-4333-8444-555555555555";
const PRODUCER_A = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const PRODUCER_B = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const UNKNOWN = "00000000-0000-4000-8000-000000000099";
const MARKET = "mkt-2026-11-01-slot-0";

const period = {
  from: "2026-11-01T00:00:00Z",
  until: "2026-11-02T00:00:00Z",
} as const;

const baseMarket = {
  marketId: MARKET,
  communityId: COMMUNITY,
  deliveryStart: "2026-11-01T00:00:00Z",
  deliveryEnd: "2026-11-01T01:00:00Z",
  mechanism: "p2p",
};

const fxDefault = [
  {
    sourceCurrency: "EUR" as const,
    targetCurrency: "CHF",
    rate: 0.9412,
    rateDate: "2026-11-30",
    source: "ECB" as const,
  },
];

function trade(
  partial: Omit<
    ScenarioDataset["trades"][number],
    "marketId" | "status" | "deliveryStart" | "deliveryEnd"
  > &
    Partial<ScenarioDataset["trades"][number]>,
): ScenarioDataset["trades"][number] {
  return {
    marketId: MARKET,
    status: "settled",
    deliveryStart: baseMarket.deliveryStart,
    deliveryEnd: baseMarket.deliveryEnd,
    ...partial,
  };
}

const scenarios: Record<ScenarioId, ScenarioDataset> = {
  S1: {
    id: "S1",
    description: "Consumer buys from 2 producers → 2 invoices",
    validates: ["REQ-054"],
    communityId: COMMUNITY,
    currency: "EUR",
    period,
    markets: [baseMarket],
    trades: [
      trade({
        tradeId: "0x8f3a1c2b4d5e6f708192a3b4c5d6e7f8",
        buyerActorId: CONSUMER,
        sellerActorId: PRODUCER_A,
        energyKWh: 10,
        pricePerKWhEur: 0.2,
      }),
      trade({
        tradeId: "0x1a2b3c4d5e6f708192a3b4c5d6e7f809",
        buyerActorId: CONSUMER,
        sellerActorId: PRODUCER_B,
        energyKWh: 12,
        pricePerKWhEur: 0.22,
      }),
    ],
    clearingResults: [
      { marketId: MARKET, tradedQuantityKWh: 22, numTrades: 2 },
    ],
    fxRates: fxDefault,
  },
  S2: {
    id: "S2",
    description: "Prosumers trade both ways → one netted invoice",
    validates: ["REQ-055"],
    communityId: COMMUNITY,
    currency: "EUR",
    period,
    markets: [baseMarket],
    trades: [
      trade({
        tradeId: "0xa1111111111111111111111111111111",
        buyerActorId: CONSUMER,
        sellerActorId: PRODUCER_A,
        energyKWh: 8,
        pricePerKWhEur: 0.2,
      }),
      trade({
        tradeId: "0xa2222222222222222222222222222222",
        buyerActorId: PRODUCER_A,
        sellerActorId: CONSUMER,
        energyKWh: 3,
        pricePerKWhEur: 0.2,
      }),
    ],
    clearingResults: [
      { marketId: MARKET, tradedQuantityKWh: 11, numTrades: 2 },
    ],
    fxRates: fxDefault,
  },
  S3: {
    id: "S3",
    description: "Pair below 5 € → carry-forward",
    validates: ["REQ-056"],
    communityId: COMMUNITY,
    currency: "EUR",
    period,
    markets: [baseMarket],
    trades: [
      trade({
        tradeId: "0xb1111111111111111111111111111111",
        buyerActorId: CONSUMER,
        sellerActorId: PRODUCER_A,
        energyKWh: 2,
        pricePerKWhEur: 0.2,
      }),
    ],
    clearingResults: [
      { marketId: MARKET, tradedQuantityKWh: 2, numTrades: 1 },
    ],
    fxRates: fxDefault,
  },
  S4: {
    id: "S4",
    description: "Trade with an unknown party → flagged, not invoiced",
    validates: ["REQ-058"],
    communityId: COMMUNITY,
    currency: "EUR",
    period,
    markets: [baseMarket],
    trades: [
      trade({
        tradeId: "0xc1111111111111111111111111111111",
        buyerActorId: CONSUMER,
        sellerActorId: UNKNOWN,
        energyKWh: 5,
        pricePerKWhEur: 0.2,
        unknownParty: true,
      }),
    ],
    clearingResults: [
      { marketId: MARKET, tradedQuantityKWh: 5, numTrades: 1 },
    ],
    fxRates: fxDefault,
  },
  S5: {
    id: "S5",
    description: "Market missing one trade vs clearing result → discrepancy",
    validates: ["REQ-041"],
    communityId: COMMUNITY,
    currency: "EUR",
    period,
    markets: [baseMarket],
    trades: [
      trade({
        tradeId: "0xd1111111111111111111111111111111",
        buyerActorId: CONSUMER,
        sellerActorId: PRODUCER_A,
        energyKWh: 4,
        pricePerKWhEur: 0.2,
      }),
    ],
    clearingResults: [
      // Clearing claims 2 trades; feed only has 1 (REQ-041).
      { marketId: MARKET, tradedQuantityKWh: 8, numTrades: 2 },
    ],
    fxRates: fxDefault,
  },
  S6: {
    id: "S6",
    description: "Late trade arriving after the run → next run",
    validates: ["REQ-001"],
    communityId: COMMUNITY,
    currency: "EUR",
    period,
    markets: [baseMarket],
    trades: [
      trade({
        tradeId: "0xe1111111111111111111111111111111",
        buyerActorId: CONSUMER,
        sellerActorId: PRODUCER_A,
        energyKWh: 6,
        pricePerKWhEur: 0.2,
        lateArrival: true,
      }),
    ],
    clearingResults: [
      { marketId: MARKET, tradedQuantityKWh: 6, numTrades: 1 },
    ],
    fxRates: fxDefault,
  },
  S7: {
    id: "S7",
    description: "Duplicate trade delivery → billed once",
    validates: ["REQ-001"],
    communityId: COMMUNITY,
    currency: "EUR",
    period,
    markets: [baseMarket],
    trades: [
      trade({
        tradeId: "0xf1111111111111111111111111111111",
        buyerActorId: CONSUMER,
        sellerActorId: PRODUCER_A,
        energyKWh: 7,
        pricePerKWhEur: 0.2,
      }),
      trade({
        tradeId: "0xf1111111111111111111111111111111",
        buyerActorId: CONSUMER,
        sellerActorId: PRODUCER_A,
        energyKWh: 7,
        pricePerKWhEur: 0.2,
      }),
    ],
    clearingResults: [
      { marketId: MARKET, tradedQuantityKWh: 7, numTrades: 1 },
    ],
    fxRates: fxDefault,
  },
  S8: {
    id: "S8",
    description: "CHF community → ECB fixture rate on invoice",
    validates: ["REQ-002"],
    communityId: COMMUNITY,
    currency: "CHF",
    period,
    markets: [baseMarket],
    trades: [
      trade({
        tradeId: "0x81111111111111111111111111111111",
        buyerActorId: CONSUMER,
        sellerActorId: PRODUCER_A,
        energyKWh: 10,
        pricePerKWhEur: 0.25,
      }),
    ],
    clearingResults: [
      { marketId: MARKET, tradedQuantityKWh: 10, numTrades: 1 },
    ],
    fxRates: fxDefault,
  },
  S9: {
    id: "S9",
    description: "Early settlement mid-period",
    validates: ["REQ-057"],
    communityId: COMMUNITY,
    currency: "EUR",
    period,
    settlementType: "early",
    markets: [baseMarket],
    trades: [
      trade({
        tradeId: "0x91111111111111111111111111111111",
        buyerActorId: CONSUMER,
        sellerActorId: PRODUCER_A,
        energyKWh: 15,
        pricePerKWhEur: 0.2,
      }),
    ],
    clearingResults: [
      { marketId: MARKET, tradedQuantityKWh: 15, numTrades: 1 },
    ],
    fxRates: fxDefault,
  },
  S10: {
    id: "S10",
    description: "Payment failures (Stripe test cards)",
    validates: ["REQ-016", "REQ-046"],
    communityId: COMMUNITY,
    currency: "EUR",
    period,
    markets: [baseMarket],
    trades: [
      trade({
        tradeId: "0xa0111111111111111111111111111111",
        buyerActorId: CONSUMER,
        sellerActorId: PRODUCER_A,
        energyKWh: 20,
        pricePerKWhEur: 0.3,
      }),
    ],
    clearingResults: [
      { marketId: MARKET, tradedQuantityKWh: 20, numTrades: 1 },
    ],
    fxRates: fxDefault,
    stripeTestCards: [
      { number: "4000000000000002", outcome: "declined" },
      { number: "4000000000009995", outcome: "insufficient_funds" },
      { number: "4000002500003155", outcome: "authentication_required" },
    ],
  },
  S11: {
    id: "S11",
    description: "Producer without KYC → invoices held",
    validates: ["REQ-045"],
    communityId: COMMUNITY,
    currency: "EUR",
    period,
    markets: [baseMarket],
    trades: [
      trade({
        tradeId: "0xb0111111111111111111111111111111",
        buyerActorId: CONSUMER,
        sellerActorId: PRODUCER_A,
        energyKWh: 9,
        pricePerKWhEur: 0.2,
      }),
    ],
    clearingResults: [
      { marketId: MARKET, tradedQuantityKWh: 9, numTrades: 1 },
    ],
    fxRates: fxDefault,
    producersWithoutKyc: [PRODUCER_A],
  },
  S12: {
    id: "S12",
    description: "Erasure request → propagation to Stripe test and IdP",
    validates: ["REQ-013"],
    communityId: COMMUNITY,
    currency: "EUR",
    period,
    markets: [baseMarket],
    trades: [],
    clearingResults: [],
    fxRates: fxDefault,
    erasureRequest: { participantId: CONSUMER },
  },
  S13: {
    id: "S13",
    description:
      "Every published message validates against billingInvoice / billingPayment",
    validates: ["REQ-048"],
    communityId: COMMUNITY,
    currency: "CHF",
    period,
    markets: [baseMarket],
    trades: [],
    clearingResults: [],
    fxRates: fxDefault,
  },
};

export function listScenarioIds(): ScenarioId[] {
  return Object.keys(scenarios) as ScenarioId[];
}

export function loadScenario(id: ScenarioId): ScenarioDataset {
  const s = scenarios[id];
  if (!s) {
    throw new Error(`Unknown scenario ${id}`);
  }
  return structuredClone(s);
}
