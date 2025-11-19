import type {
  InvoiceProjection,
  OutboundMessage,
  PaymentProjection,
} from "./types.js";

export class PublicationStore {
  private invoices = new Map<string, InvoiceProjection>();
  private payments = new Map<string, PaymentProjection>();
  private outbound = new Map<string, OutboundMessage>();

  reset(): void {
    this.invoices.clear();
    this.payments.clear();
    this.outbound.clear();
  }

  putInvoice(row: InvoiceProjection): void {
    this.invoices.set(row.invoiceId, structuredClone(row));
  }

  getInvoice(invoiceId: string): InvoiceProjection | undefined {
    const row = this.invoices.get(invoiceId);
    return row ? structuredClone(row) : undefined;
  }

  putPayment(row: PaymentProjection): void {
    this.payments.set(row.paymentId, structuredClone(row));
  }

  getPayment(paymentId: string): PaymentProjection | undefined {
    const row = this.payments.get(paymentId);
    return row ? structuredClone(row) : undefined;
  }

  putOutbound(row: OutboundMessage): void {
    this.outbound.set(row.messageId, structuredClone(row));
  }

  findOutboundByAggregate(
    topic: string,
    aggregateId: string,
  ): OutboundMessage | undefined {
    for (const row of this.outbound.values()) {
      if (row.topic === topic && row.aggregateId === aggregateId) {
        return structuredClone(row);
      }
    }
    return undefined;
  }

  listOutbound(): OutboundMessage[] {
    return [...this.outbound.values()].map((r) => structuredClone(r));
  }

  listPendingOrFailed(): OutboundMessage[] {
    return this.listOutbound().filter(
      (r) => r.status === "pending" || r.status === "failed",
    );
  }

  /** Drop local outbound rows whose updatedAt is before the cutoff (REQ-053). */
  purgeLocalBefore(beforeIso: string): number {
    const beforeMs = Date.parse(beforeIso);
    let removed = 0;
    for (const [id, row] of this.outbound) {
      if (Date.parse(row.updatedAt) < beforeMs) {
        this.outbound.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}
