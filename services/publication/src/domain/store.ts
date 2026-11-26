import type {
  InvoiceProjection,
  KycProjection,
  OutboundMessage,
  PaymentProjection,
} from "./types.js";

export class PublicationStore {
  private readonly invoices = new Map<string, InvoiceProjection>();
  private readonly payments = new Map<string, PaymentProjection>();
  private readonly outbound = new Map<string, OutboundMessage>();
  /** INT-448 — last UserAccount projection per actor (merge KYC vs T&C updates). */
  private readonly userAccounts = new Map<string, KycProjection>();

  reset(): void {
    this.invoices.clear();
    this.payments.clear();
    this.outbound.clear();
    this.userAccounts.clear();
  }

  putUserAccount(row: KycProjection): void {
    this.userAccounts.set(row.actorId, structuredClone(row));
  }

  getUserAccount(actorId: string): KycProjection | undefined {
    const row = this.userAccounts.get(actorId);
    return row ? structuredClone(row) : undefined;
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
