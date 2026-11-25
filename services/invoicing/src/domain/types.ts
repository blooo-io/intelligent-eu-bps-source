export type InvoiceStatus =
  | "Draft"
  | "Open"
  | "PartiallyPaid"
  | "Paid"
  | "Overdue"
  | "Void"
  | "Disputed";

/** REQ-039 — party shown on the self-billing PDF (retained under REQ-013). */
export type InvoiceParty = {
  participantId: string;
  name: string;
  address: string;
};

/** REQ-054 / REQ-050 — self-billing mandate accepted in the T&C. */
export type SelfBillingMandate = {
  termsVersion: string;
  acceptedAt: string | null;
};

/** REQ-007 / REQ-004 — amount split on the invoice. */
export type InvoiceAmounts = {
  energy: string;
  gridFee: string;
  levy: string;
  tax: string;
  vat: string;
  total: string;
};

/** REQ-007 — one trade on the invoice, signed in the invoice direction. */
export type InvoiceTradeLine = {
  tradeId: string;
  deliveryStart?: string;
  deliveryEnd?: string;
  /** Addressee role on this trade (REQ-007). */
  role?: "buyer" | "seller";
  kWh: string;
  pricePerKWh: string;
  /** A10.3 — market-adjusted price when present. */
  adjustedPricePerKWh?: string;
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
  /** REQ-004 — grid fee / levy / tax when a DSO tariff applies; else 0. */
  gridFeeAmount?: string;
  levyAmount?: string;
  taxAmount?: string;
  tariffId?: string | null;
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
  /** ISO timestamp when the invoice was issued (PDF metadata / DSAR). */
  issuedAt?: string;
  /** REQ-039 — producer as legal issuer (names stay in DB only). */
  issuer?: InvoiceParty;
  /** REQ-039 — consumer as addressee. */
  addressee?: InvoiceParty;
  /** REQ-054 — self-billing mandate shown on the PDF. */
  mandate?: SelfBillingMandate | null;
  /** REQ-007 / REQ-004 — full amount split for the PDF and public API. */
  amounts?: InvoiceAmounts;
  /** BR-07 — VAT fraction (0..1) shown as a percentage on the PDF. */
  vatRate?: number;
  /** BR-06 — ECB rate when the community currency is not EUR. */
  exchangeRate?: { rate: string; rateDate: string } | null;
  /** REQ-004 — DSO tariff id when charges apply. */
  tariffId?: string | null;
  /** REQ-039 — stored PDF fingerprint (bytes live in the document store). */
  document?: { sha256: string; byteLength: number } | null;
  /** Total energy covered by the invoice. */
  totalKWh?: string;
  carriedForwardIn?: string;
  settlementType?: "periodic" | "final";
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
