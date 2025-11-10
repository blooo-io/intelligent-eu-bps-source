export type BillingRunType = "periodic" | "early" | "final";

export type UnbilledTrade = {
  tradeId: string;
  consumerId: string;
  producerId: string;
  communityId: string;
  /** Energy in kWh (exact). */
  kWh: number;
  /** EUR price per kWh from the market (never adjusted — BR-03). */
  pricePerKWhEur: number;
};

export type CommunityBillingContext = {
  communityId: string;
  currency: "EUR" | "CHF";
  /** Threshold in community currency (BR-05 default 5.00). */
  threshold: number;
  /** VAT rate as fraction, e.g. 0 (BR-07). */
  vatRate: number;
  billingMode: "live" | "virtual";
};

export type PairSettlementRecord = {
  settlementId: string;
  runId: string;
  consumerId: string;
  producerId: string;
  tradeIds: string[];
  kWh: string;
  energyAmount: string;
  vat: string;
  currency: string;
  rate: string;
  carriedForwardIn: string;
  carriedForwardOut: string;
  /** Net before threshold decision, community currency. */
  netAmount: number;
  version: number;
};

export type BillingRunRecord = {
  runId: string;
  communityId: string;
  period: string;
  type: BillingRunType;
  version: number;
  settlementIds: string[];
};
