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
  /** Participant who paid / was paid (for overview filtering). */
  participantId?: string;
};

export type PeriodicSummary = {
  communityId: string;
  period: string;
  currency?: string;
  invoiceCount: number;
  paymentCount: number;
  total: string;
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
