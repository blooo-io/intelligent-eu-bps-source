export type InvoiceStatus =
  | "Draft"
  | "Open"
  | "PartiallyPaid"
  | "Paid"
  | "Overdue"
  | "Void"
  | "Disputed";

/** REQ-007 — one trade on the invoice, signed in the invoice direction. */
export type InvoiceTradeLine = {
  tradeId: string;
  deliveryStart?: string;
  deliveryEnd?: string;
  kWh: string;
  pricePerKWh: string;
  amount: string;
};

export type PairSettlementInput = {
  settlementId: string;
  runId: string;
  consumerId: string;
  producerId: string;
  tradeIds: string[];
  /** REQ-007 — absent on settlements created before INT-354. */
  lines?: InvoiceTradeLine[];
  /** BR-05 — carried balance entering the invoice, oriented consumer → producer. */
  carriedForwardIn?: string;
  kWh: string;
  energyAmount: string;
  vat: string;
  currency: string;
  rate: string;
  /** BR-06 — date of the ECB reference rate (YYYY-MM-DD). */
  rateDate?: string;
  /** REQ-059 — billing period of the run (`YYYY-MM` or `YYYY-Qn`). */
  period?: string;
  /** INT-376 — inclusive period start from the billing run (UTC date-time). */
  periodFrom?: string;
  /** INT-376 — exclusive period end from the billing run (UTC date-time). */
  periodUntil?: string;
  /** INT-376 / REQ-057 — periodic or final (early removed). */
  settlementType?: "periodic" | "final";
  /** BR-07 — VAT fraction used when the settlement was computed. */
  vatRate?: number;
  communityId: string;
};

/** Manual / webhook status change with mandatory reason (REQ-044 / UAT-055). */
export type InvoiceStatusAudit = {
  actorId: string;
  status: InvoiceStatus;
  reason: string;
  at: string;
  source: "manual" | "payment" | "mark_overdue";
};

/** REQ-061 — payment reminder sent for an invoice (manual or scheduled). */
export type InvoiceReminder = {
  /** Calendar date (UTC YYYY-MM-DD) when the reminder was sent. */
  sentOn: string;
  trigger: "manual" | "scheduled";
  reminderNumber: number;
};

export type InvoiceRecord = {
  invoiceId: string;
  settlementId: string;
  /** REQ-059 — billing run and period the invoice was issued for (statement grouping). */
  runId: string;
  period: string;
  periodFrom: string;
  periodUntil: string;
  producerId: string;
  consumerId: string;
  currency: string;
  status: InvoiceStatus;
  total: string;
  tradeIds: string[];
  /** REQ-007 — per-trade lines copied from the settlement. */
  lines: InvoiceTradeLine[];
  /** Billing-assigned legal number once issued (BR-10 / REQ-042 / A6). */
  legalNumber: string | null;
  /** Energy line amount at issue time (for public InvoiceAmounts). */
  energyAmount: string;
  /** VAT line amount at issue time. */
  vatAmount: string;
  dueDate: string;
  communityId: string;
  /** Audit trail of status changes — identifiers + reason only (REQ-044). */
  statusAudit: InvoiceStatusAudit[];
  /** REQ-061 — reminders already sent (manual + scheduled). */
  reminders: InvoiceReminder[];
};

/**
 * REQ-013 / Task 3.19 — DSAR invoice row (issuer or addressee).
 * Identifiers and amounts only; no personal data.
 */
export type InvoiceSummary = {
  invoiceId: string;
  legalNumber: string | null;
  period: string;
  partyRole: "issuer" | "addressee";
  total: string;
  currency: string;
  status: string;
  issuedAt: string | null;
};
