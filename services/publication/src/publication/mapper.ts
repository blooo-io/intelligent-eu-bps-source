import type { InvoiceProjection, PaymentProjection } from "../domain/types.js";

/**
 * Map local projections → EWDS topic payloads (NFR-004 / REQ-048).
 * Money is numeric on the wire; grid fees stay 0 (A20 / REQ-048).
 * BR-11: mapper never writes trade status — tradeIds are identifiers only.
 */
export function toBillingInvoice(
  invoice: InvoiceProjection,
): Record<string, unknown> {
  return {
    invoiceId: invoice.invoiceId,
    billingId: invoice.billingId,
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
    gridFeeAmount: 0,
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
