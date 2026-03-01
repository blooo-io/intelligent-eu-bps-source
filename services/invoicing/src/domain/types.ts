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

/** Manual / webhook status change with mandatory reason (REQ-044 / UAT-055). */
export type InvoiceStatusAudit = {
  actorId: string;
  status: InvoiceStatus;
  reason: string;
  at: string;
  source: "manual" | "stripe" | "mark_overdue";
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
  /** Stripe hosted invoice URL (PDF / pay page) when available (REQ-039). */
  hostedInvoiceUrl: string | null;
  /** Energy line amount at issue time (for public InvoiceAmounts). */
  energyAmount: string;
  /** VAT line amount at issue time. */
  vatAmount: string;
  /** Producer Connect account used at issue (AC-07 destination charges). */
  producerStripeAccountId: string | null;
  dueDate: string;
  communityId: string;
  /** Audit trail of status changes — identifiers + reason only (REQ-044). */
  statusAudit: InvoiceStatusAudit[];
};
