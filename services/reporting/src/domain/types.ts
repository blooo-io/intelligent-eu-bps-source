/** Local invoice projection for AC-09 read models (identifiers + amounts only). */
export type InvoiceProjection = {
  invoiceId: string;
  communityId: string;
  producerId: string;
  consumerId: string;
  period: string;
  currency: string;
  status: string;
  /** Money string BR-08. */
  total: string;
  tradeIds: string[];
  /** Optional energy for KPI export (kWh as decimal string). */
  energyKwh?: string;
};

export type PaymentProjection = {
  paymentId: string;
  invoiceId: string;
  communityId: string;
  amount: string;
  currency: string;
  status: string;
  method?: string;
  failureCategory?: string;
  /** End-to-end processing time in ms (REQ-046 / KPI TE-2). */
  processingTimeMs?: number;
  /** Payer participant id (same as payerId; for overview / KPI filtering). */
  participantId?: string;
  /** Consumer who pays (REQ-046). */
  payerId?: string;
  /** Producer who is paid (REQ-046). */
  payeeId?: string;
  /** When payment was initiated (REQ-046 / KPI TE-2). */
  initiatedAt?: string;
  /** When payment settled (REQ-046 / KPI TE-2). */
  settledAt?: string;
  /** PSP fee amount (REQ-046). */
  feeAmount?: string;
  /** PSP fee currency (REQ-046). */
  feeCurrency?: string;
};

/** Statement money components aligned with WS1 (REQ-047 / REQ-059). */
export type StatementComponents = {
  energy: string;
  gridFee: string;
  levies: string;
  vat: string;
};

/**
 * Local statement projection for AC-09 payout overview (REQ-060) and KPI CSV (REQ-047).
 * Task 1.19 fields (totalSold / totalBought / netBalance) stay for payout overview;
 * Task 5.12 adds energy, netAmount, components and invoiceIds for WS1 alignment.
 */
export type StatementProjection = {
  statementId: string;
  participantId: string;
  communityId: string;
  period: string;
  totalSold: string;
  totalBought: string;
  /** Signed balance for payout overview (REQ-060); mirrors netAmount when issued from WS1. */
  netBalance: string;
  currency: string;
  status: string;
  /** Energy bought in the period (kWh decimal string). */
  energyBoughtKwh: string;
  /** Energy sold in the period (kWh decimal string). */
  energySoldKwh: string;
  /** Signed net for KPI CSV (REQ-047); same money as netBalance. */
  netAmount: string;
  components: StatementComponents;
  invoiceIds: string[];
};

/** Local payout projection for AC-09 payout overview / paidOut (REQ-060). */
export type PayoutProjection = {
  payoutId: string;
  participantId: string;
  communityId: string;
  period: string;
  amount: string;
  currency: string;
  status: string;
};

export type PeriodicSummary = {
  communityId: string;
  period: string;
  currency?: string;
  invoiceCount: number;
  paymentCount: number;
  total: string;
  /** Connect payouts completed in the period (REQ-032 / REQ-060). */
  paidOut: string;
};

/** Per-method payment KPIs (REQ-046 / TE-2 / ER1.4). */
export type PaymentMethodStats = {
  method: string;
  feeCurrency: string;
  count: number;
  succeededCount: number;
  failedCount: number;
  pendingCount: number;
  successRate: number | null;
  medianProcessingTimeMs: number | null;
  totalFee: string;
  averageFee: string | null;
  feeMissingCount: number;
};

export type PaymentMethodReport = {
  communityId: string;
  period: string;
  rows: PaymentMethodStats[];
};

export type KpiExportRow = {
  communityId: string;
  period: string;
  participantId: string;
  invoiceId: string;
  amount: string;
  energyKwh: string;
  currency: string;
};

export type BuiltReport = {
  communityId: string;
  period: string;
  summary: PeriodicSummary;
  builtAt: string;
};

export type BuiltKpiExport = {
  communityId: string;
  period: string;
  /** CSV body (V1 file export, REQ-047). */
  csv: string;
  builtAt: string;
};
