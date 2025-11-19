/** AC-10 domain — OutboundMessage / PublicationStatus (02 §6 LB-08). */

export type DataSpaceTopic = "billingInvoice" | "billingPayment";

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
  billingId: string;
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
  taxAmount: number;
  vatRate: number;
  carriedForwardAmount: number;
  currency: string;
  exchangeRate: {
    sourceCurrency: string;
    rate: number;
    rateDate: string;
    rateSource: string;
  };
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
  paymentDate: string;
  paymentAmount: number;
  currency: string;
  paymentMethod: string;
  paymentProvider: string;
  paymentStatus: string;
  failureCategory: string | null;
  createdAt: string;
  updatedAt: string;
};
