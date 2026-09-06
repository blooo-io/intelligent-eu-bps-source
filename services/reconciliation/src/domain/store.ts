import type {
  Discrepancy,
  IntakeAnomalyProjection,
  InvoiceProjection,
  MarketProjection,
  PaymentProjection,
} from "./types.js";

/** In-memory read projections + discrepancy store for V1 (TP-7 rebuildable cache). */
export class ReconciliationStore {
  private readonly invoices = new Map<string, InvoiceProjection>();
  private readonly payments = new Map<string, PaymentProjection>();
  private readonly markets = new Map<string, MarketProjection>();
  private readonly anomalies = new Map<string, IntakeAnomalyProjection>();
  private readonly discrepancies = new Map<string, Discrepancy>();

  reset(): void {
    this.invoices.clear();
    this.payments.clear();
    this.markets.clear();
    this.anomalies.clear();
    this.discrepancies.clear();
  }

  putInvoice(row: InvoiceProjection): void {
    this.invoices.set(row.invoiceId, structuredClone(row));
  }

  putPayment(row: PaymentProjection): void {
    this.payments.set(row.paymentId, structuredClone(row));
  }

  putMarket(row: MarketProjection): void {
    this.markets.set(row.marketId, structuredClone(row));
  }

  putAnomaly(row: IntakeAnomalyProjection): void {
    this.anomalies.set(row.marketId, structuredClone(row));
  }

  listInvoices(communityId?: string): InvoiceProjection[] {
    return [...this.invoices.values()]
      .filter((r) => !communityId || r.communityId === communityId)
      .map((r) => structuredClone(r));
  }

  listPaymentsForInvoice(invoiceId: string): PaymentProjection[] {
    return [...this.payments.values()]
      .filter((r) => r.invoiceId === invoiceId)
      .map((r) => structuredClone(r));
  }

  listMarkets(communityId?: string): MarketProjection[] {
    return [...this.markets.values()]
      .filter((r) => !communityId || r.communityId === communityId)
      .map((r) => structuredClone(r));
  }

  listAnomalies(communityId?: string): IntakeAnomalyProjection[] {
    return [...this.anomalies.values()]
      .filter((r) => !communityId || r.communityId === communityId)
      .map((r) => structuredClone(r));
  }

  getDiscrepancyByKey(key: string): Discrepancy | undefined {
    const row = this.discrepancies.get(key);
    return row ? structuredClone(row) : undefined;
  }

  putDiscrepancy(row: Discrepancy): void {
    this.discrepancies.set(row.key, structuredClone(row));
  }

  listDiscrepancies(communityId?: string): Discrepancy[] {
    return [...this.discrepancies.values()]
      .filter((r) => !communityId || r.communityId === communityId)
      .map((r) => structuredClone(r));
  }
}
