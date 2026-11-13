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
  /** INT-376 — inclusive period start from the billing run (UTC date-time). */
  periodFrom?: string;
  /** INT-376 — exclusive period end from the billing run (UTC date-time). */
  periodUntil?: string;
  /** INT-376 — periodic, early or final. */
  settlementType?: "periodic" | "early" | "final";
  /** BR-07 — VAT fraction used when the settlement was computed. */
  vatRate?: number;
  communityId: string;
  /** INT-197 / UAT-028 — real Connect account when seeding against Stripe test. */
  producerStripeAccountId?: string;
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
  /** REQ-007 — per-trade lines copied from the settlement. */
  lines: InvoiceTradeLine[];
  /** Stripe invoice id — Stripe is master (TP-7 / BR-10). */
  stripeInvoiceId: string;
  /** Stripe-assigned legal number once finalized (BR-10). */
  legalNumber: string | null;
  /** Stripe invoice PDF URL, hosted page as fallback (REQ-039, INT-355). */
  hostedInvoiceUrl: string | null;
  /** Energy line amount at issue time (for public InvoiceAmounts). */
  energyAmount: string;
  /** VAT line amount at issue time. */
  vatAmount: string;
  /** Producer Connect account that issued the Stripe invoice; AC-07 pays it there (INT-355). */
  producerStripeAccountId: string | null;
  dueDate: string;
  communityId: string;
  /** Audit trail of status changes — identifiers + reason only (REQ-044). */
  statusAudit: InvoiceStatusAudit[];
};
