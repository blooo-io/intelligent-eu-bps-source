/** AC-15 / INT-101 — shared fixture types for P-MKT, P-DS, P-FX. */

export type ScenarioId =
  | "S1"
  | "S2"
  | "S3"
  | "S4"
  | "S5"
  | "S6"
  | "S7"
  | "S8"
  | "S10"
  | "S11"
  | "S12"
  | "S13";

export type TradeStatus = "settled" | "open" | "cancelled";

export interface TimeWindow {
  from: string;
  until: string;
}

export interface TradeFixture {
  tradeId: string;
  marketId: string;
  buyerActorId: string;
  sellerActorId: string;
  energyKWh: number;
  /** Price in EUR per kWh (market clears in EUR; FX applied later for CHF). */
  pricePerKWhEur: number;
  /**
   * A10.3 — optional adjusted unit price after tariff/incentive (EUR/kWh).
   * Consumed by trade-intake when present on the EWDS Trade payload.
   */
  adjustedPricePerKWhEur?: number;
  status: TradeStatus;
  deliveryStart: string;
  deliveryEnd: string;
  /** S4 — party not known to participants module. */
  unknownParty?: boolean;
  /** S6 — arrived after the settlement run window. */
  lateArrival?: boolean;
}

export interface MarketInfo {
  marketId: string;
  communityId: string;
  deliveryStart: string;
  deliveryEnd: string;
  mechanism: string;
}

export interface ClearingResult {
  marketId: string;
  tradedQuantityKWh: number;
  numTrades: number;
}

export interface FxRate {
  sourceCurrency: "EUR";
  targetCurrency: string;
  rate: number;
  rateDate: string;
  source: "ECB";
}

export interface StripeTestCard {
  number: string;
  outcome: "declined" | "insufficient_funds" | "authentication_required";
}

export interface ScenarioDataset {
  id: ScenarioId;
  description: string;
  validates: string[];
  communityId: string;
  currency: "EUR" | "CHF";
  period: TimeWindow;
  settlementType?: "periodic" | "final";
  markets: MarketInfo[];
  trades: TradeFixture[];
  clearingResults: ClearingResult[];
  fxRates: FxRate[];
  stripeTestCards?: StripeTestCard[];
  producersWithoutKyc?: string[];
  erasureRequest?: { participantId: string };
}

/** REQ-048 — five billing record topics published on the data space. */
export type DataSpaceTopic =
  | "billingStatement"
  | "billingInvoice"
  | "billingPayment"
  | "billingPayout"
  | "billingKycStatus";

export interface PublishResult {
  ok: boolean;
  errors?: string[];
}

/** P-MKT — async so the live EWDS adapter can await request/reply (Task 4.8). */
export interface MarketPort {
  queryTrades(window: TimeWindow): Promise<TradeFixture[]>;
  queryMarkets(window: TimeWindow): Promise<MarketInfo[]>;
  queryClearingResults(marketId: string): Promise<ClearingResult>;
}

export interface FxPort {
  getRate(currency: string, date: string): FxRate;
}

export interface DataSpacePort {
  publish(topic: DataSpaceTopic, message: unknown): Promise<PublishResult>;
  purgeCache(before: string): Promise<number>;
  recorded(): ReadonlyArray<{ topic: DataSpaceTopic; message: unknown }>;
}

export interface MockSuite {
  scenario: ScenarioDataset;
  market: MarketPort;
  fx: FxPort;
  dataSpace: DataSpacePort;
}
