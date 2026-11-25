import type {
  InvoiceProjection,
  KycProjection,
  PaymentProjection,
  PayoutProjection,
  StatementProjection,
} from "../domain/types.js";

/**
 * Map local projections → EWDS topic payloads (NFR-004 / REQ-048 / REQ-004).
 * R6: gridFeeAmount = gridFee + levy; taxAmount = totalTaxAmount = tax + VAT.
 * BR-11: mapper never writes trade status — tradeIds are identifiers only.
 */

/** Integer-cent sum of money values, returned as a major-unit number. */
export function addMoney(...values: unknown[]): number {
  let cents = 0;
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const n = Number(value);
    if (!Number.isFinite(n)) continue;
    cents += Math.round(n * 100);
  }
  return cents / 100;
}

export function toBillingInvoice(
  invoice: InvoiceProjection,
): Record<string, unknown> {
  return {
    invoiceId: invoice.invoiceId,
    billingId: invoice.billingId,
    issuerStatementId: invoice.issuerStatementId,
    communityId: invoice.communityId,
    billingMode: invoice.billingMode,
    settlementType: invoice.settlementType,
    billingPeriodFrom: invoice.billingPeriodFrom,
    billingPeriodUntil: invoice.billingPeriodUntil,
    invoiceStatus: invoice.invoiceStatus,
    invoiceIssueDate: invoice.invoiceIssueDate,
    invoiceIssuedTo: invoice.invoiceIssuedTo,
    invoiceIssuedBy: invoice.invoiceIssuedBy,
    selfBilling: invoice.selfBilling,
    invoiceDueDate: invoice.invoiceDueDate,
    totalEnergyKWh: invoice.totalEnergyKWh,
    totalAmount: invoice.totalAmount,
    outstandingAmount: invoice.outstandingAmount,
    energyAmount: invoice.energyAmount,
    gridFeeAmount: invoice.gridFeeAmount,
    gridFeeStatus: invoice.gridFeeStatus,
    taxAmount: invoice.taxAmount,
    totalTaxAmount: invoice.taxAmount,
    vatRate: invoice.vatRate,
    carriedForwardAmount: invoice.carriedForwardAmount,
    currency: invoice.currency,
    exchangeRate: invoice.exchangeRate,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
    tradeIds: [...invoice.tradeIds],
    paymentIds:
      invoice.paymentIds.length > 0 ? [...invoice.paymentIds] : null,
  };
}

export function toBillingPayment(
  payment: PaymentProjection,
): Record<string, unknown> {
  return {
    paymentId: payment.paymentId,
    invoiceId: payment.invoiceId,
    communityId: payment.communityId,
    billingMode: payment.billingMode,
    payerId: payment.payerId,
    payeeId: payment.payeeId,
    paymentDate: payment.paymentDate,
    paymentAmount: payment.paymentAmount,
    currency: payment.currency,
    paymentMethod: payment.paymentMethod,
    paymentProvider: payment.paymentProvider,
    paymentStatus: payment.paymentStatus,
    failureCategory: payment.failureCategory,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

/** REQ-059 — ontology Billing / billingStatement. */
export function toBillingStatement(
  s: StatementProjection,
): Record<string, unknown> {
  return {
    billingId: s.billingId,
    communityId: s.communityId,
    actorId: s.actorId,
    siteId: s.siteId,
    billingMode: s.billingMode,
    billingPeriodFrom: s.billingPeriodFrom,
    billingPeriodUntil: s.billingPeriodUntil,
    billingStatus: s.billingStatus,
    overdueDate: s.overdueDate,
    totalBought: s.totalBought,
    totalSold: s.totalSold,
    netBalance: s.netBalance,
    balanceDirection: s.balanceDirection,
    totalEnergyAmount: s.totalEnergyAmount,
    totalGridFeeAmount: s.totalGridFeeAmount,
    totalTaxAmount: s.totalTaxAmount,
    totalAmountDue: s.totalAmountDue,
    totalAmountPaid: s.totalAmountPaid,
    outstandingAmount: s.outstandingAmount,
    currency: s.currency,
    invoiceIds: [...s.invoiceIds],
    payoutIds: s.payoutIds ? [...s.payoutIds] : null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

/** REQ-060 — billingPayout; never includes bank/IBAN fields (NFR-004). */
export function toBillingPayout(p: PayoutProjection): Record<string, unknown> {
  return {
    payoutId: p.payoutId,
    actorId: p.actorId,
    communityId: p.communityId,
    billingMode: p.billingMode,
    amount: p.amount,
    currency: p.currency,
    payoutStatus: p.payoutStatus,
    trigger: p.trigger,
    statementIds: [...p.statementIds],
    arrivalDate: p.arrivalDate,
    failureCategory: p.failureCategory,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** A5 — billingKycStatus; identifiers only. */
export function toBillingKycStatus(k: KycProjection): Record<string, unknown> {
  return {
    actorId: k.actorId,
    communityId: k.communityId,
    kycVerified: k.kycVerified,
    accountStatus: k.accountStatus,
    verificationKind: k.verificationKind,
    updatedAt: k.updatedAt,
  };
}
