import type { InvoiceProjection, PaymentProjection } from "../domain/types.js";

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
