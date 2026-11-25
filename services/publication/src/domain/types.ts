/** AC-10 domain — OutboundMessage / PublicationStatus (02 §6 LB-08). */

/** REQ-048 — five billing record topics (Task 4.8 / INT-440). */
export type DataSpaceTopic =
  | "billingStatement"
  | "billingInvoice"
  | "billingPayment"
  | "billingPayout"
  | "billingKycStatus";

export type OutboundStatus = "pending" | "published" | "failed";

export type OutboundMessage = {
  messageId: string;
  topic: DataSpaceTopic;
  /** Aggregate id (invoiceId or paymentId) for idempotent re-publish. */
  aggregateId: string;
  payload: Record<string, unknown>;
  status: OutboundStatus;
  publishedAt?: string;
  /** Local cache expiry hint (≤ 7 days from publish — REQ-053). */
  purgeAt?: string;
  updatedAt: string;
};

/** Wide invoice projection — richer than domain AsyncAPI until events are enriched. */
export type InvoiceProjection = {
  invoiceId: string;
  /** Consumer statement for the period (EWDS billingId). */
  billingId: string;
  /** Producer statement for the period (Task 4.1 / REQ-048). */
  issuerStatementId: string;
  communityId: string;
  billingMode: "virtual" | "live";
  settlementType: string;
  billingPeriodFrom: string;
  billingPeriodUntil: string;
  invoiceStatus: string;
  invoiceIssueDate: string;
  invoiceIssuedTo: string;
  invoiceIssuedBy: string;
  selfBilling: boolean;
  invoiceDueDate: string;
  totalEnergyKWh: number;
  totalAmount: number;
  outstandingAmount: number;
  energyAmount: number;
  /** gridFee + levy in major units (R6 / REQ-004). */
  gridFeeAmount: number;
  /** applied when a non-zero grid fee is published; else not_published (A10.2). */
  gridFeeStatus: "applied" | "not_published";
  /** tax + VAT in major units (R6 / REQ-004). */
  taxAmount: number;
  vatRate: number;
  carriedForwardAmount: number;
  currency: string;
  /** Null when the invoice currency is EUR (NFR-004: no conversion). */
  exchangeRate: {
    sourceCurrency: string;
    rate: number;
    rateDate: string;
    rateSource: "ECB";
  } | null;
  tradeIds: string[];
  paymentIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type PaymentProjection = {
  paymentId: string;
  invoiceId: string;
  communityId: string;
  billingMode: "virtual" | "live";
  payerId: string;
  payeeId: string;
  paymentDate: string | null;
  paymentAmount: number;
  currency: string;
  paymentMethod: string | null;
  paymentProvider: string;
  paymentStatus: string;
  failureCategory: string | null;
  createdAt: string;
  updatedAt: string;
};
