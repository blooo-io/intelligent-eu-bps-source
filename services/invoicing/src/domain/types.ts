export type InvoiceStatus =
  | "Draft"
  | "Open"
  | "PartiallyPaid"
  | "Paid"
  | "Overdue"
  | "Void"
  | "Disputed";

export type PairSettlementInput = {
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
  communityId: string;
};

export type InvoiceRecord = {
  invoiceId: string;
  settlementId: string;
  producerId: string;
  consumerId: string;
  currency: string;
  status: InvoiceStatus;
  total: string;
  tradeIds: string[];
  /** Stripe invoice id — Stripe is master (TP-7 / BR-10). */
  stripeInvoiceId: string;
  /** Stripe-assigned legal number once finalized (BR-10). */
  legalNumber: string | null;
  dueDate: string;
  communityId: string;
};
