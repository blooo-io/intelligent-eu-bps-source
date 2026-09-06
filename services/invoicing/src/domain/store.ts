import type { InvoiceRecord } from "./types.js";
import { seedUatInvoices } from "./uat-seed.js";

/** Rebuildable Stripe read cache + local invoice ids (TP-7). */
export class InvoiceStore {
  private readonly byId = new Map<string, InvoiceRecord>();
  private readonly bySettlement = new Map<string, string>();

  constructor() {
    // INT-218 — load UAT fixture invoices once (survives nothing; re-seed on construct).
    for (const row of seedUatInvoices()) {
      this.put(row);
    }
  }

  reset(): void {
    this.byId.clear();
    this.bySettlement.clear();
    for (const row of seedUatInvoices()) {
      this.put(row);
    }
  }

  get(invoiceId: string): InvoiceRecord | undefined {
    const row = this.byId.get(invoiceId);
    return row ? structuredClone(row) : undefined;
  }

  findBySettlement(settlementId: string): InvoiceRecord | undefined {
    const id = this.bySettlement.get(settlementId);
    return id ? this.get(id) : undefined;
  }

  put(row: InvoiceRecord): void {
    this.byId.set(row.invoiceId, structuredClone(row));
    this.bySettlement.set(row.settlementId, row.invoiceId);
  }

  list(): InvoiceRecord[] {
    return [...this.byId.values()].map((r) => structuredClone(r));
  }

  /** REQ-013 — invoices involving a participant (retained under legal retention). */
  listByParticipant(participantId: string): InvoiceRecord[] {
    return this.list().filter(
      (row) =>
        row.consumerId === participantId || row.producerId === participantId,
    );
  }
}
