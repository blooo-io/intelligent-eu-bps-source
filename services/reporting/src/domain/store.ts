import type {
  BuiltKpiExport,
  BuiltReport,
  InvoiceProjection,
  PaymentProjection,
} from "./types.js";

export class ReportingStore {
  private invoices = new Map<string, InvoiceProjection>();
  private payments = new Map<string, PaymentProjection>();
  private reports = new Map<string, BuiltReport>();
  private kpiExports = new Map<string, BuiltKpiExport>();

  reset(): void {
    this.invoices.clear();
    this.payments.clear();
    this.reports.clear();
    this.kpiExports.clear();
  }

  putInvoice(row: InvoiceProjection): void {
    this.invoices.set(row.invoiceId, structuredClone(row));
  }

  getInvoice(invoiceId: string): InvoiceProjection | undefined {
    const row = this.invoices.get(invoiceId);
    return row ? structuredClone(row) : undefined;
  }

  listInvoices(filter?: {
    communityId?: string;
    period?: string;
    participantId?: string;
  }): InvoiceProjection[] {
    return [...this.invoices.values()]
      .filter((row) => {
        if (filter?.communityId && row.communityId !== filter.communityId) {
          return false;
        }
        if (filter?.period && row.period !== filter.period) return false;
        if (
          filter?.participantId &&
          row.consumerId !== filter.participantId &&
          row.producerId !== filter.participantId
        ) {
          return false;
        }
        return true;
      })
      .map((r) => structuredClone(r));
  }

  putPayment(row: PaymentProjection): void {
    this.payments.set(row.paymentId, structuredClone(row));
  }

  listPayments(filter?: {
    communityId?: string;
    invoiceIds?: Set<string>;
  }): PaymentProjection[] {
    return [...this.payments.values()]
      .filter((row) => {
        if (filter?.communityId && row.communityId !== filter.communityId) {
          return false;
        }
        if (filter?.invoiceIds && !filter.invoiceIds.has(row.invoiceId)) {
          return false;
        }
        return true;
      })
      .map((r) => structuredClone(r));
  }

  putReport(row: BuiltReport): void {
    this.reports.set(`${row.communityId}:${row.period}`, structuredClone(row));
  }

  getReport(communityId: string, period: string): BuiltReport | undefined {
    const row = this.reports.get(`${communityId}:${period}`);
    return row ? structuredClone(row) : undefined;
  }

  putKpiExport(row: BuiltKpiExport): void {
    this.kpiExports.set(
      `${row.communityId}:${row.period}`,
      structuredClone(row),
    );
  }

  getKpiExport(
    communityId: string,
    period: string,
  ): BuiltKpiExport | undefined {
    const row = this.kpiExports.get(`${communityId}:${period}`);
    return row ? structuredClone(row) : undefined;
  }
}
