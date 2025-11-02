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
  | "S9"
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
  settlementType?: "periodic" | "early" | "final";
  markets: MarketInfo[];
  trades: TradeFixture[];
  clearingResults: ClearingResult[];
  fxRates: FxRate[];
  stripeTestCards?: StripeTestCard[];
  producersWithoutKyc?: string[];
  erasureRequest?: { participantId: string };
}

export type DataSpaceTopic = "billingInvoice" | "billingPayment";

export interface PublishResult {
  ok: boolean;
  errors?: string[];
}

export interface MarketPort {
  queryTrades(window: TimeWindow): TradeFixture[];
  queryMarkets(window: TimeWindow): MarketInfo[];
  queryClearingResults(marketId: string): ClearingResult;
}

export interface FxPort {
  getRate(currency: string, date: string): FxRate;
}

export interface DataSpacePort {
  publish(topic: DataSpaceTopic, message: unknown): PublishResult;
  purgeCache(before: string): number;
  recorded(): ReadonlyArray<{ topic: DataSpaceTopic; message: unknown }>;
}

export interface MockSuite {
  scenario: ScenarioDataset;
  market: MarketPort;
  fx: FxPort;
  dataSpace: DataSpacePort;
}
