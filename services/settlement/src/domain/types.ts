import type { Cadence } from "./period.js";
import type { InvoiceTradeLine } from "./trade-lines.js";

export type BillingRunType = "periodic" | "final";

export type UnbilledTrade = {
  tradeId: string;
  consumerId: string;
  producerId: string;
  communityId: string;
  /** Energy in kWh (exact). */
  kWh: number;
  /** EUR price per kWh from the market (never adjusted — BR-03). */
  pricePerKWhEur: number;
  /** BR-02 — delivery period copied from the market. */
  deliveryStart?: string;
  deliveryEnd?: string;
};

export type CommunityBillingContext = {
  communityId: string;
  currency: "EUR" | "CHF";
  /** Threshold in community currency (BR-05 default 5.00). */
  threshold: number;
  /** VAT rate as fraction, e.g. 0 (BR-07). */
  vatRate: number;
  billingMode: "live" | "virtual";
  /** REQ-006 — community calendar, monthly by default. */
  billingPeriod: Cadence;
  /**
   * B2 / REQ-004 — when false (default), grid fee / levy / tax stay zero
   * even if AC-13 has a tariff.
   */
  tariffBilling?: boolean;
};

export type PairSettlementRecord = {
  settlementId: string;
  runId: string;
  consumerId: string;
  producerId: string;
  tradeIds: string[];
  /** REQ-007 — per-trade lines. Empty for a carried-only settlement. */
  lines: InvoiceTradeLine[];
  kWh: string;
  /** Energy line only — excludes grid fee / levy / tax (REQ-004 R3). */
  energyAmount: string;
  /** REQ-004 — oriented charges; zeros when the pair is carried (BR-05). */
  gridFeeAmount: string;
  levyAmount: string;
  taxAmount: string;
  /** REQ-004 — DSO tariff id when charges apply; else null. */
  tariffId: string | null;
  vat: string;
  currency: string;
  rate: string;
  /** BR-06 — date of the ECB reference rate applied. */
  rateDate: string;
  /** BR-07 — VAT fraction applied when this settlement was computed. */
  vatRate?: number;
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
