/** AC-08 domain types — ReconciliationResult / Discrepancy (02 §6 LB-07). */

export type DiscrepancyScope = "invoice" | "market";

export type Discrepancy = {
  id: string;
  /** Stable key for idempotent recording across reconcile runs. */
  key: string;
  scope: DiscrepancyScope;
  expected: string;
  actual: string;
  status: string;
  communityId: string;
};

export type InvoiceProjection = {
  invoiceId: string;
  total: string;
  currency: string;
  communityId: string;
  status: string;
};

export type PaymentProjection = {
  paymentId: string;
  invoiceId: string;
  amount: string;
  currency: string;
  status: string;
  communityId: string;
};

export type MarketProjection = {
  marketId: string;
  communityId: string;
  expectedNumTrades: number;
  expectedTradedQuantityKWh: string;
  actualNumTrades: number;
  actualTradedQuantityKWh: string;
};

export type IntakeAnomalyProjection = {
  type: string;
  marketId: string;
  communityId: string;
  details?: string;
};
